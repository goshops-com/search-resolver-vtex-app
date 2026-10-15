// Pegá acá la función de parseo que usa GoPersonal al sincronizar productos desde VTEX.
// Archivo temporal de análisis: no forma parte de la app.

function normalizeKey(key) {
    return key.toLowerCase().trim().replace(/\s+/g, "_");
}

function normalizeCategory(category) {
    if (!category) return "";
    return category.split("/").filter(Boolean).join("|").toLowerCase();
}

function specValueToString(value) {
    if (value == null) return "";
    if (Array.isArray(value)) {
        return value.join("|");
    }
    if (typeof value === "object") {
        return JSON.stringify(value);
    }
    return String(value);
}

function normalizeSpecs(specs) {
    if (!specs || typeof specs !== "object") return {};
    return Object.entries(specs).reduce((acc, [key, value]) => {
        acc[normalizeKey(key)] = specValueToString(value);
        return acc;
    }, {});
}

function buildMetadata(product) {
    const metadata = [];
    if (product.clusterhighlights != null) {
        metadata.push({
            type: "clusterhighlights",
            value: product.clusterhighlights
        });
    }
    return metadata;
}

// Datos de VTEX que el fetcher agrega en transformProduct y que hacen falta
// para renderizar el producto sin volver a pedírselo a VTEX.
function buildVtexFields(product, sku) {
    return {
        brand_id: product.brand_id,
        link_text: product.link_text,
        category_ids: product.category_path_ids || [],
        sellers: sku.sellers || [],
        images: sku.images || [],
        variations: sku.variations || [],
    };
}

function transformProducts(products) {
    const eanMagentoPoints = ["2026260301011", "3349668657001", "2025030501016", "7804907924925", "2025030501017", "5060527644106", "689358361799", "836773001377", "2025030501017", "2025030501015", "8011003887514", "9780102830156", "2026030501011", "840216930520", "840216930537", "840216931299", "2026030201012", "815305025890", "815305025937", "403202601012", "2026100301011", "8809835063233", "8809835063585", "2025030501011", "2025030501012", "2025030501013", "840216933514", "2025030501014", "836773001353", "836773002282", "785364171473", "2025081101016", "2025241201011", "2025090801015", "615908434019", "2026020301014", "2026012201011", "2026012201012", "2026050101012", "2026050101011", "2025090801014", "2026100301012", "2026100301013", "2026100301014", "2026052501011", "2026051501014", "2026051501015", "8800283646009", "8800283646139", "2805202601019", "2805202601018", "2805202601020", "8809738315897", ];
    const eanMagentoPointsSet = new Set(eanMagentoPoints);
    return products.flatMap(product => product.skus.map(sku => {
        // Campos crudos de VTEX: sólo van dentro de vtex_product, no se indexan
        // sueltos. clusterHighlights y productClusters quedan en productFields
        // porque GoPersonal ya los indexaba.
        const {
            category_path_ids, brandImageUrl, productReference, rawProductReferenceCode,
            productTitle, metaTagDescription, releaseDate, searchableClusters,
            categories, categoriesIds, link, allSpecifications, allSpecificationsGroups,
            completeSpecifications, items, raw_specs,
            ...productFields
        } = product;
        const merged = {
            ...sku,
            ...productFields,
            url: product.url,
            imgs: sku.imgs,
            _v: "8",
            badges: product.clusterhighlights,
            metadata: buildMetadata(product),
            ...normalizeSpecs(sku.specs || product.specs),
            ...buildVtexFields(product, sku),
            active: product.skus.some(s => s.active === 1) ? 1 : product.active,
        };
        if (Number(merged.price) === 0 || eanMagentoPointsSet.has(String(merged.ean))) {
            merged.active = 0;
        }
        const normalized = Object.entries(merged).reduce((acc, [key, value]) => {
            const normalizedKey = normalizeKey(key);
            acc[normalizedKey] = normalizedKey === "category" ? normalizeCategory(value) : value;
            return acc;
        }, {});
        // Último atributo: el producto de VTEX como string JSON, con los nombres
        // de VTEX para que la app no tenga que renombrar nada.
        normalized.vtex_product = JSON.stringify({
            productId: product.id,
            productName: product.name,
            brand: product.brand,
            brandId: product.brand_id,
            brandImageUrl,
            linkText: product.link_text,
            productReference,
            productReferenceCode: rawProductReferenceCode,
            categoryId: product.category_ids,
            productTitle,
            metaTagDescription,
            releaseDate,
            clusterHighlights: product.clusterHighlights,
            productClusters: product.productClusters,
            searchableClusters,
            categories,
            categoriesIds,
            // Relativo, igual que la hidratación del catálogo: el host absoluto
            // de VTEX manda a los compradores al login del admin.
            link: product.link_text ? `/${product.link_text}/p` : link,
            description: product.description,
            allSpecifications,
            allSpecificationsGroups,
            completeSpecifications,
            // Mismo SKU que arma la hidratación del catálogo, con defaults en
            // los arrays que los resolvers recorren sin chequear.
            items: (items || []).map(item => ({
                ...item,
                complementName: item.complementName || "",
                ean: item.ean || "",
                referenceId: item.referenceId || [],
                kitItems: item.kitItems || [],
                attachments: item.attachments || [],
                Videos: item.Videos || [],
                variations: item.variations || [],
                images: item.images || [],
                sellers: (item.sellers || []).map(seller => ({
                    ...seller,
                    addToCartLink: "",
                    commertialOffer: {
                        ...seller.commertialOffer,
                        Installments: seller.commertialOffer?.Installments || [],
                        Teasers: seller.commertialOffer?.Teasers || [],
                        DiscountHighLight: seller.commertialOffer?.DiscountHighLight || [],
                        GiftSkuIds: seller.commertialOffer?.GiftSkuIds || [],
                    },
                })),
            })),
            ...raw_specs,
        });
        return normalized;
    }));
}
parsedResults = transformProducts(items);