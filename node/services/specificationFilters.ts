import { debugLog } from './debugLog'
import { timed } from './timing'

/**
 * VBase prefixes the bucket with `vendor.app-name.` and rejects names over 50
 * characters: `specification-field` overflowed it, so the map was never saved
 * and every search looked every field up again.
 */
const SPECIFICATION_FIELD_BUCKET = 'fields'
const FILTERABLE_FIELDS_FILE = 'filterable.json'

type FilterableFieldMap = Record<string, boolean>

/**
 * Field flags change only when the catalog is reconfigured, so each worker
 * keeps the map it last read or wrote and skips VBase on later searches.
 */
const KNOWN_FIELDS_TTL_MS = 10 * 60 * 1000

let knownFields: { map: FilterableFieldMap; expiresAt: number } | null = null

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

  const memory =
    knownFields && knownFields.expiresAt > Date.now() ? knownFields.map : null

  const known =
    memory ??
    (await timed(
      ctx,
      'vbase.filterableFields',
      () =>
        vbase
          .getJSON<FilterableFieldMap>(
            SPECIFICATION_FIELD_BUCKET,
            FILTERABLE_FIELDS_FILE,
            true
          )
          .catch((error) => {
            debugLog(
              ctx,
              'vbase:filterableFields:readFailed',
              { error: error?.message, status: error?.response?.status },
              'error'
            )

            return null
          }),
      (map) => ({ knownFields: map ? Object.keys(map).length : 0 })
    )) ?? {}

  const unknownIds = fieldIds.filter((fieldId) => !(fieldId in known))

  if (memory && unknownIds.length === 0) {
    return pickFilterable(known, fieldIds)
  }

  const resolved = await timed(
    ctx,
    'catalog.unknownFields',
    () =>
      Promise.all(
        unknownIds.map(async (fieldId) => {
          const field = await search
            .specificationField(fieldId)
            .catch(() => null)

          return Boolean(field?.IsFilter && field.IsActive)
        })
      ),
    () => ({ unknown: unknownIds.length })
  )

  if (!memory || unknownIds.length > 0) {
    knownFields = { map: known, expiresAt: Date.now() + KNOWN_FIELDS_TTL_MS }
  }

  if (unknownIds.length > 0) {
    unknownIds.forEach((fieldId, index) => {
      known[fieldId] = resolved[index]
    })

    // The next request should not pay for these fields again; a failed write
    // only costs a repeated lookup.
    const saveStarted = Date.now()

    vbase
      .saveJSON(SPECIFICATION_FIELD_BUCKET, FILTERABLE_FIELDS_FILE, known)
      .then(() =>
        debugLog(ctx, 'vbase:filterableFields:saved', {
          fields: Object.keys(known).length,
          durationMs: Date.now() - saveStarted,
        })
      )
      .catch((error) =>
        debugLog(
          ctx,
          'vbase:filterableFields:saveFailed',
          {
            fields: Object.keys(known).length,
            durationMs: Date.now() - saveStarted,
            error: error?.message,
            status: error?.response?.status,
            data: error?.response?.data,
          },
          'error'
        )
      )
  }

  return pickFilterable(known, fieldIds)
}

function pickFilterable(known: FilterableFieldMap, fieldIds: string[]) {
  return fieldIds.reduce<Set<string>>((filterable, fieldId) => {
    if (known[fieldId]) {
      filterable.add(fieldId)
    }

    return filterable
  }, new Set())
}

/** Tests resolve different flags for the same field ids. */
export function clearKnownFieldsCache() {
  knownFields = null
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
