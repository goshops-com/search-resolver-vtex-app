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

function transformProducts(products) {
    const eanMagentoPoints = ["2026260301011", "3349668657001", "2025030501016", "7804907924925", "2025030501017", "5060527644106", "689358361799", "836773001377", "2025030501017", "2025030501015", "8011003887514", "9780102830156", "2026030501011", "840216930520", "840216930537", "840216931299", "2026030201012", "815305025890", "815305025937", "403202601012", "2026100301011", "8809835063233", "8809835063585", "2025030501011", "2025030501012", "2025030501013", "840216933514", "2025030501014", "836773001353", "836773002282", "785364171473", "2025081101016", "2025241201011", "2025090801015", "615908434019", "2026020301014", "2026012201011", "2026012201012", "2026050101012", "2026050101011", "2025090801014", "2026100301012", "2026100301013", "2026100301014", "2026052501011", "2026051501014", "2026051501015", "8800283646009", "8800283646139", "2805202601019", "2805202601018", "2805202601020", "8809738315897", ];
    const eanMagentoPointsSet = new Set(eanMagentoPoints);
    return products.flatMap(product => product.skus.map(sku => {
        const merged = {
            ...sku,
            ...product,
            url: product.url,
            imgs: sku.imgs,
            _v: "8",
            badges: product.clusterhighlights,
            metadata: buildMetadata(product),
            ...normalizeSpecs(sku.specs || product.specs),
            active: product.skus.some(s => s.active === 1) ? 1 : product.active,
        };
        if (Number(merged.price) === 0 || eanMagentoPointsSet.has(String(merged.ean))) {
            merged.active = 0;
        }
        return Object.entries(merged).reduce((acc, [key, value]) => {
            const normalizedKey = normalizeKey(key);
            acc[normalizedKey] = normalizedKey === "category" ? normalizeCategory(value) : value;
            return acc;
        }, {});
    }));
}
parsedResults = transformProducts(items);