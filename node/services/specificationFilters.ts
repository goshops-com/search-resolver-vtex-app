const SPECIFICATION_FIELD_BUCKET = 'specification-field'
const FILTERABLE_FIELDS_FILE = 'filterable.json'

type FilterableFieldMap = Record<string, boolean>

/**
 * Resolves which specifications the catalog is configured to filter by.
 *
 * Products carry every specification they were filled in with, but only the
 * ones flagged `IsFilter` are meant to be offered as filters — that flag is
 * what Intelligent Search uses to decide which attributes become facets.
 * Without it the sidebar lists every descriptive field ("Bullets", "Peso",
 * "Información adicional"), which is both noise and unusable as a filter.
 *
 * The flag lives on `fieldGet`, one call per field, and a result set touches a
 * couple hundred fields, so the whole map is kept in a single VBase document:
 * only fields never seen before cost a request, and the map is shared by every
 * query instead of being rebuilt per search. It is keyed by id rather than by
 * name because unrelated fields reuse the same name with different flags.
 */
export async function fetchFilterableFieldIds(
  ctx: Context,
  fieldIds: string[]
): Promise<Set<string>> {
  const { vbase, search } = ctx.clients

  const known =
    (await vbase
      .getJSON<FilterableFieldMap>(
        SPECIFICATION_FIELD_BUCKET,
        FILTERABLE_FIELDS_FILE,
        true
      )
      .catch(() => null)) ?? {}

  const unknownIds = fieldIds.filter((fieldId) => !(fieldId in known))

  const resolved = await Promise.all(
    unknownIds.map(async (fieldId) => {
      const field = await search.specificationField(fieldId).catch(() => null)

      return Boolean(field?.IsFilter && field.IsActive)
    })
  )

  if (unknownIds.length > 0) {
    unknownIds.forEach((fieldId, index) => {
      known[fieldId] = resolved[index]
    })

    // The next request should not pay for these fields again; a failed write
    // only costs a repeated lookup.
    vbase
      .saveJSON(SPECIFICATION_FIELD_BUCKET, FILTERABLE_FIELDS_FILE, known)
      .catch(() => null)
  }

  return fieldIds.reduce<Set<string>>((filterable, fieldId) => {
    if (known[fieldId]) {
      filterable.add(fieldId)
    }

    return filterable
  }, new Set())
}

export function extractSpecificationFieldIds(
  products: SearchProduct[]
): string[] {
  const ids = new Set<string>()

  products.forEach((product) => {
    product.completeSpecifications?.forEach(({ FieldId }) => {
      if (FieldId) {
        ids.add(String(FieldId))
      }
    })
  })

  return Array.from(ids)
}
