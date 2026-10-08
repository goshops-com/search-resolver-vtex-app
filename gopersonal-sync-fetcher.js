// Pegá acá el paso previo del sync de GoPersonal: la función que consulta VTEX,
// arma los `items` (skus, imgs, specs, categorías, etc.) y luego invoca el parse
// de gopersonal-sync-parser.js. Incluí también el punto donde se inyecta/llama ese parse.
// Archivo temporal de análisis: no forma parte de la app.

const axios = require("axios");
const axiosRetry = require("axios-retry");
const { Integration } = require("../../integration.model");
const md5Utils = require("../../../../utils/md5Util");
// Create the axios instance
const vm = require("vm");

const { v4: uuidv4 } = require("uuid");
const azureUpload = require("../../../../plugins/azureUpload");

const axiosInstance = axios.create();

// Apply retry logic
axiosRetry(axiosInstance, {
  retries: 5,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return (
      axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      error.response.status >= 429
    );
  },
});

async function getTotal(url, appKey, appToken) {
  const headers = {
    "X-VTEX-API-AppKey": appKey,
    "X-VTEX-API-AppToken": appToken,
  };

  try {
    const response = await axiosInstance({
      method: "get",
      url: `${url}/api/catalog_system/pvt/products/GetProductAndSkuIds?_from=0&_to=1`,
      headers,
    });

    const total = response.data.range.total;
    return total;
  } catch (error) {
    console.error(`Error fetching total:`, error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
  }
}

async function getProductsIds(url, appKey, appToken, from, to) {
  const headers = {
    "X-VTEX-API-AppKey": appKey,
    "X-VTEX-API-AppToken": appToken,
  };

  try {
    const response = await axiosInstance({
      method: "get",
      url: `${url}/api/catalog_system/pvt/products/GetProductAndSkuIds?_from=${from}&_to=${to}`,
      headers,
    });

    const ids = Object.keys(response.data.data);
    return ids;
  } catch (error) {
    console.error(`Error fetching IDS:`, error.message);
    return [];
  }
}

async function getProducts(url, appKey, appToken, productIds, options = {}) {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new Error("El parámetro productIds debe ser un arreglo no vacío.");
  }

  const headers = {
    "X-VTEX-API-AppKey": appKey,
    "X-VTEX-API-AppToken": appToken,
  };

  // Construir la query con los productIds
  const query = productIds
    .slice(0, 50)
    .map((id) => `fq=productId:${id}`)
    .join("&");

  try {
    const response = await axiosInstance({
      method: "get",
      url: `${url}/api/catalog_system/pub/products/search?${query}`,
      headers,
    });

    let products = response.data;

    // Transform products
    const transformedProducts = products.map((product) =>
      transformProduct(product, options.overrideURL || url),
    );

    // VM Parse Execution
    const parseFunction =
      options.parse ||
      `
                function transformProducts(products) {
                    return products.flatMap(product => 
                        product.skus.map(sku => ({
                            ...product,
                            ...sku,
                            imgs: sku.imgs
                        })).map(({id, name, description, category, brand, active, url, imgs}) => ({
                            id,
                            name,
                            description,
                            category,
                            brand,
                            active,
                            url,
                            imgs
                        }))
                    );
                }
                
                parsedResults = transformProducts(items);
            `;

    const sandbox = {
      items: transformedProducts,
      // Respuesta cruda de pub/products/search, para que el parse pueda leer
      // los campos que transformProduct descarta (sellers, imageId, etc.).
      rawItems: products,
      parsedResults: [],
      console: console,
    };

    const script = new vm.Script(parseFunction);
    const context = vm.createContext(sandbox);

    try {
      script.runInContext(context);
      return sandbox.parsedResults;
    } catch (error) {
      console.error("Script execution failed:", error);
      throw error;
    }
  } catch (error) {
    console.error("Error fetching products:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
  }
}

function transformProduct(product, baseUrl) {
  if (!product || typeof product !== "object") {
    console.error("Invalid product object");
    return null;
  }

  const transformedProduct = {
    id: product.productId || "",
    name: product.productName || "",
    description: product.description || "",
    category:
      Array.isArray(product.categories) && product.categories.length > 0
        ? product.categories[0]
        : "",
    category_ids: product.categoryId || "",
    brand: product.brand || "",
    active:
      Array.isArray(product.items) &&
      product.items.some(
        (sku) =>
          sku.sellers &&
          sku.sellers[0] &&
          sku.sellers[0].commertialOffer &&
          sku.sellers[0].commertialOffer.IsAvailable,
      )
        ? 1
        : 0,
    url: product.linkText ? `${baseUrl}/${product.linkText}/p` : "",
    price: getLowestPrice(product.items),
    regular_price: getHighestListPrice(product.items),
    discount_tag: calculateDiscountTag(
      getLowestPrice(product.items),
      getHighestListPrice(product.items),
    ),
    skus: transformSkus(product.items, baseUrl, product),
    specs: processSpecifications(product),
  };

  if (Array.isArray(product.Especificaciones)) {
    product.Especificaciones.forEach((specName) => {
      if (product[specName] && Array.isArray(product[specName])) {
        transformedProduct[specName] = product[specName][0] || "";
      }
    });
  }

  if (Object.prototype.hasOwnProperty.call(product, "clusterHighlights")) {
    transformedProduct.clusterHighlights = product.clusterHighlights ?? {};
  }

  return transformedProduct;
}

async function syncProductsLargeCatalog(integrationId) {
  console.log("Integration syncProducts Id", integrationId);
  const startTime = Date.now();

  const model = new Integration().getInstance();
  const updatedData = await model.findOne({ _id: integrationId });
  console.log(`ID del proyecto: ${updatedData.project}`);
  if (!updatedData) {
    console.log("Cannot find integration");
    return;
  }

  const integrationData = updatedData.data;
  const executionObj = {
    products: 0,
    startedAt: new Date(),
    errors: [],
  };

  async function persistExecution() {
    executionObj.endedAt = new Date();
    const durationMs = executionObj.endedAt - executionObj.startedAt;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    executionObj.duration =
      minutes > 0 ? `${minutes} min ${seconds} sec` : `${seconds} sec`;
    executionObj.executionId = `${integrationId}-${Date.now()}`;

    await model.updateOne(
      { _id: integrationId },
      {
        $push: {
          executions: {
            $each: [executionObj],
            $slice: -100,
          },
        },
      },
    );
  }

  try {
    const total = await getTotal(
      integrationData.url,
      integrationData.appKey,
      integrationData.appToken,
    );

    const batchSize = 49;
    const batchNumber = Math.ceil(total / batchSize);

    //batches
    let batches = [];
    const syncId = uuidv4();
    for (let i = 0; i < batchNumber; i++) {
      const from = i * batchSize;
      const to = Math.min((i + 1) * batchSize, total); // Que to no supere el total
      batches.push({ from, to });
    }

    //para estimaciones y progreso
    let processedBatches = 0;
    let lastCheckpointTime = Date.now();
    let totalElapsedTime = 0;
    let totalProcessedBatches = 0;
    let queuedProducts = 0;

    const parallelBatchs = 10;
    const urls = [];
    let queuedChunks = 0;
    for (let i = 0; i < batches.length; i += parallelBatchs) {
      const batchFraction = batches
        .slice(i, i + parallelBatchs)
        .map((batch, offset) => ({
          ...batch,
          batchIndex: i + offset,
        }));

      const promises = batchFraction.map(async (batch) => {
        try {
          const ids = await getProductsIds(
            integrationData.url,
            integrationData.appKey,
            integrationData.appToken,
            batch.from,
            batch.to,
          );
          const products = await getProducts(
            integrationData.url,
            integrationData.appKey,
            integrationData.appToken,
            ids,
            (options = {
              overrideURL: integrationData.product_url
                ? integrationData.product_url
                : integrationData.url,
              parse: integrationData.parse_products || integrationData.products.parse
            }),
          );
          if (!Array.isArray(products) || products.length === 0) {
            // El último batch debe devolver su marcador aunque venga vacío:
            // sin él nunca se encola el job last_chunk que cierra el sync
            // (desactiva stale y dispara el train).
            return {
              tmpDocs: [],
              batchIndex: batch.batchIndex,
              isLastBatch: batch.batchIndex === batches.length - 1,
            };
          }
          const tmpDocs = [];
          products.forEach((p) => {
            tmpDocs.push({
              project: updatedData.project,
              company: updatedData.company,
              data: p,
            });
          });

          return {
            tmpDocs,
            batchIndex: batch.batchIndex,
            isLastBatch: batch.batchIndex === batches.length - 1,
          };
        } catch (error) {
          const errorMessage = `Error processing VTEX batch ${batch.batchIndex} (${batch.from}-${batch.to}): ${error.message}`;
          executionObj.errors.push({ message: errorMessage });
          Sentry.captureException(error);
          console.error(errorMessage);
          return null;
        }
      });

      const batchResults = await Promise.all(promises);

      for (const result of batchResults) {
        if (!result) continue;
        const { tmpDocs, batchIndex, isLastBatch } = result;
        if ((!tmpDocs || tmpDocs.length === 0) && !isLastBatch) {
          continue;
        }

        const executionId = uuidv4();
        const serializedData = JSON.stringify(tmpDocs || []);
        const buffer = Buffer.from(serializedData, "utf-8");

        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 1);
        const url = await azureUpload.uploadFileDirectly(
          buffer,
          `${executionId}.json`,
          { pathPrefix: "drafts", expiresOn: sevenDaysFromNow },
          "application/json",
        );
        urls.push(url);

        let delay = 10 * 1000 + Math.min(queuedChunks, 10) * 1000;

        const options = {
          syncId: syncId,
          upload: "azure",
          chunked_sync: true,
          last_chunk: isLastBatch,
        };
        if (isLastBatch) {
          options.url = urls;
          delay = delay * 4;
        }

        global.itemSyncQueueItem.add(
          {
            executionId,
            type: "item",
            syncId,
            project: updatedData.project,
            options,
          },
          { removeOnComplete: true, removeOnFail: true, delay: delay },
        );
        queuedChunks++;
        queuedProducts += tmpDocs.length;
        executionObj.products = queuedProducts;
        console.log("Sync queued:", executionId, "batch", batchIndex);
      }

      //progreso sobre el total y estimacion
      processedBatches += batchFraction.length;
      const elapsedTime = Date.now() - lastCheckpointTime;
      lastCheckpointTime = Date.now();

      // Acumular tiempos y lotes procesados
      totalElapsedTime += elapsedTime;
      totalProcessedBatches += batchFraction.length;

      // Calcular el promedio acumulado de tiempo por batch
      const avgTimePerBatch = totalElapsedTime / totalProcessedBatches;
      const remainingBatches = batchNumber - processedBatches;
      const estimatedTimeRemaining = avgTimePerBatch * remainingBatches;

      // Mostrar progreso y tiempo estimado restante con solo 4 dígitos
      console.log(`Progress: ${processedBatches} / ${batchNumber}`);
      console.log(
        `Estimated time remaining: ${(estimatedTimeRemaining / 1000 / 60).toFixed(2).slice(0, 4)} mins`,
      );

      await sleep(500);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // await require("./../../../../workers/itemCreate").updateActiveItems(syncId, updatedData.project);

    // Update integration status
    await model.updateOne(
      { _id: integrationId },
      {
        $set: {
          execution: {
            lastSyncDuration: duration,
            lastSyncEndTime: new Date(endTime),
            lastSyncStatus: "success",
          },
        },
      },
    );
    await persistExecution();
    console.log(`Synced products. Duration: ${duration}ms`);
    return;
  } catch (error) {
    console.error("Error syncing products:", error);
    Sentry.captureException(error);
    executionObj.errors.push({ message: error.message });
    try {
      await persistExecution();
    } catch (persistError) {
      console.error("Error persisting execution:", persistError.message);
      Sentry.captureException(persistError);
    }

    // Update integration status with error
    await model.updateOne(
      { _id: integrationId },
      {
        $set: {
          "execution.lastSyncEndTime": new Date(),
          "execution.lastSyncStatus": "error",
          "execution.lastSyncError": error.message,
        },
      },
    );
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLowestPrice(items) {
  const prices = items
    .flatMap((item) => item.sellers)
    .filter((seller) => seller?.commertialOffer?.IsAvailable)
    .map((seller) => seller?.commertialOffer?.Price)
    .filter((price) => typeof price === "number" && !isNaN(price));

  return prices.length > 0 ? Math.min(...prices) : null;
}

function getHighestListPrice(items) {
  const listPrices = items
    .flatMap((item) => item.sellers)
    .filter((seller) => seller?.commertialOffer?.IsAvailable)
    .map((seller) => seller?.commertialOffer?.ListPrice)
    .filter((price) => typeof price === "number" && !isNaN(price));

  return listPrices.length > 0 ? Math.max(...listPrices) : null;
}

function calculateDiscountTag(price, listPrice) {
  if (price && listPrice && price < listPrice) {
    const discountPercentage = (
      ((listPrice - price) / listPrice) *
      100
    ).toFixed(2);
    return `${discountPercentage}% off`;
  }
  return null;
}

function processSpecifications(productData) {
  // Get the list of all specification keys
  const specKeys = productData.allSpecifications || [];

  // Initialize result object
  const specifications = {};

  // Iterate over each specification key
  specKeys.forEach((key) => {
    // Skip group specifications (those starting with 'G.')
    if (key.startsWith("G.")) {
      return;
    }

    // Get the value for the current key if it exists
    if (productData[key]) {
      // Keep the value as is, whether it's an array or not
      specifications[key] = productData[key];
    }
  });

  return specifications;
}

function transformSkus(items, baseUrl, product) {
  return (items || []).map((item) => {
    // Transform skuSpecifications into sku_specs format
    const skuSpecs = [];

    // Add specifications from variations
    if (Array.isArray(item.variations)) {
      item.variations.forEach((variation) => {
        skuSpecs.push({
          FieldName: variation,
          FieldValues: item[variation] || [],
        });
      });
    }

    // Add specifications from skuSpecifications
    if (Array.isArray(item.skuSpecifications)) {
      item.skuSpecifications.forEach((spec) => {
        if (spec.field && spec.field.name && spec.values) {
          skuSpecs.push({
            FieldName: spec.field.name,
            FieldValues: spec.values.map((v) => v.name),
          });
        }
      });
    }

    return {
      id: item.itemId || "",
      name: item.name || "",
      ean: item.ean,
      active:
        item.sellers &&
        item.sellers[0] &&
        item.sellers[0].commertialOffer &&
        item.sellers[0].commertialOffer.IsAvailable
          ? 1
          : 0,
      url: item.detailUrl ? `${baseUrl}${item.detailUrl}` : "",
      imgs: Array.isArray(item.images)
        ? item.images.map((img) => ({
            url: (img.imageUrl || "").split("?")[0],
          }))
        : [],
      sku_specs: skuSpecs,
      product_specs: extractProductSpecs(product),
      talla: item["Talla Sku"], // Keep this for backward compatibility if needed
    };
  });
}
function extractProductSpecs(product) {
  const specs = [];
  if (product && Array.isArray(product.Especificaciones)) {
    product.Especificaciones.forEach((specName) => {
      if (product[specName] && Array.isArray(product[specName])) {
        specs.push({
          FieldName: specName,
          FieldValues: product[specName],
        });
      }
    });
  }
  return specs;
}

module.exports = {
  syncProductsLargeCatalog,
};
