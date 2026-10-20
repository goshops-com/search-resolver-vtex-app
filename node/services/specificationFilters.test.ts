import {
  clearKnownFieldsCache,
  extractSpecificationFieldIds,
  fetchFilterableFieldIds,
} from './specificationFilters'

const product = (fieldIds: string[]): SearchProduct =>
  ({
    completeSpecifications: fieldIds.map((FieldId) => ({
      FieldId,
      Name: `spec-${FieldId}`,
      Position: 1,
      IsOnProductDetails: true,
      Values: [],
    })),
  } as any)

const contextWith = (fields: Record<string, Partial<SpecificationField>>) =>
  ({
    clients: {
      vbase: {
        getJSON: jest.fn().mockResolvedValue(undefined),
        saveJSON: jest.fn().mockResolvedValue(undefined),
      },
      search: {
        specificationField: jest.fn((fieldId: string) =>
          fields[fieldId]
            ? Promise.resolve(fields[fieldId])
            : Promise.reject(new Error('not found'))
        ),
      },
    },
  } as any)

describe('extractSpecificationFieldIds', () => {
  it('collects each field id once across every product', () => {
    expect(
      extractSpecificationFieldIds([product(['1', '2']), product(['2', '3'])])
    ).toEqual(['1', '2', '3'])
  })

  it('tolerates products without specifications', () => {
    expect(extractSpecificationFieldIds([{} as SearchProduct])).toEqual([])
  })
})

describe('fetchFilterableFieldIds', () => {
  beforeEach(() => {
    clearKnownFieldsCache()
  })

  it('keeps only the active filterable fields', async () => {
    const ctx = contextWith({
      '1': { IsFilter: true, IsActive: true },
      '2': { IsFilter: false, IsActive: true },
      '3': { IsFilter: true, IsActive: false },
    })

    const result = await fetchFilterableFieldIds(ctx, ['1', '2', '3'])

    expect(Array.from(result)).toEqual(['1'])
  })

  it('drops fields the catalog cannot resolve instead of failing the search', async () => {
    const ctx = contextWith({ '1': { IsFilter: true, IsActive: true } })

    const result = await fetchFilterableFieldIds(ctx, ['1', '404'])

    expect(Array.from(result)).toEqual(['1'])
  })

  it('reads cached definitions instead of asking the catalog again', async () => {
    const ctx = contextWith({ '1': { IsFilter: false, IsActive: true } })

    ctx.clients.vbase.getJSON.mockResolvedValue({ '1': true })

    const result = await fetchFilterableFieldIds(ctx, ['1'])

    expect(Array.from(result)).toEqual(['1'])
    expect(ctx.clients.search.specificationField).not.toHaveBeenCalled()
  })

  it('only looks up the fields missing from the cache', async () => {
    const ctx = contextWith({ '2': { IsFilter: true, IsActive: true } })

    ctx.clients.vbase.getJSON.mockResolvedValue({ '1': false })

    const result = await fetchFilterableFieldIds(ctx, ['1', '2'])

    expect(Array.from(result)).toEqual(['2'])
    expect(ctx.clients.search.specificationField).toHaveBeenCalledTimes(1)
    expect(ctx.clients.search.specificationField).toHaveBeenCalledWith('2')
    expect(ctx.clients.vbase.saveJSON).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { '1': false, '2': true }
    )
  })

  it('keeps the bucket name within the VBase limit', async () => {
    const ctx = contextWith({ '1': { IsFilter: true, IsActive: true } })

    await fetchFilterableFieldIds(ctx, ['1'])

    const [bucket] = ctx.clients.vbase.saveJSON.mock.calls[0]

    // VBase prefixes `vendor.app-name.` and caps the whole name at 50.
    expect(
      `youraccount.gopersonal-search-resolver.${bucket}`.length
    ).toBeLessThanOrEqual(50)
  })

  it('answers later searches from memory without reading VBase again', async () => {
    const ctx = contextWith({ '1': { IsFilter: true, IsActive: true } })

    await fetchFilterableFieldIds(ctx, ['1'])
    const result = await fetchFilterableFieldIds(ctx, ['1'])

    expect(Array.from(result)).toEqual(['1'])
    expect(ctx.clients.vbase.getJSON).toHaveBeenCalledTimes(1)
    expect(ctx.clients.search.specificationField).toHaveBeenCalledTimes(1)
  })
})
