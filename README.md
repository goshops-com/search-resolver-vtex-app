# gopersonal-search-resolver

A fork of [`vtex.search-resolver`](https://github.com/vtex-apps/search-resolver)
that answers full-text search with the **GoPersonal** search engine instead of
VTEX Intelligent Search.

This is the **resolver layer** of the search stack:

- Schema (the contract): [`vtex.search-graphql`](https://github.com/vtex-apps/search-graphql)
- Resolvers (this app): `gopersonal-search-resolver`, a fork of [`vtex.search-resolver`](https://github.com/vtex-apps/search-resolver)

---

# Installation

Installing this app is what switches the store's search provider: the storefront
asks `vtex.search-graphql` for results, the platform routes that to whichever
search-resolver app is installed on the account, and replacing the app replaces
the engine. **No storefront code has to change** — but the store theme still has
to be reviewed, because it can bring the native resolver back on its own (step 2).

> [!CAUTION]
> **A workspace can only have one search-resolver installed.** If two are
> present the workspace breaks — this is a documented VTEX limitation, not a bug
> in this app. Step 2 is therefore mandatory, not optional.
>
> Do the whole process in a **development workspace first**. Step 2 uninstalls
> the store's current search resolver, and on `master` that takes search down
> for real shoppers until step 4 finishes.

> [!IMPORTANT]
> Ask GoPersonal for the **project id** before you start — it identifies the
> project that will answer queries, and the app falls back to VTEX Intelligent
> Search without it.

---

## 1. Set the vendor

A VTEX app is identified by `vendor.name`, and **the vendor must be an account you
can publish from** — it has to match the account you are logged into when you run
`vtex publish`.

In `manifest.json`, change `"vendor"` to that account:

```json
{
  "vendor": "youraccount",
  "name": "gopersonal-search-resolver"
}
```

Confirm which account you are on with `vtex whoami`.

## 2. Remove the native search resolver

```sh
vtex list                          # find the installed search-resolver
vtex uninstall vtex.search-resolver
```

### Also check the store theme for `vtex.search`

Uninstalling is not always enough. `vtex.search`, the native Intelligent Search
storefront app, declares `vtex.search-resolver` as its **own dependency**, so a
theme that depends on `vtex.search` makes the platform reinstall the native
resolver as a transitive dependency. `vtex list` then shows only this app while
the PLP's SSR render still goes through the native one.

The symptom is autocomplete returning GoPersonal results while the results page
returns VTEX's, for the same term. Look for it in the theme's `manifest.json`:

```json
"dependencies": {
  "vtex.search": "2.x"
}
```

If it is there, it has to be removed from the theme, and the theme released,
published and installed again — this part is done on the theme's repo, not here,
so it usually needs whoever owns the storefront.

## 3. Publish the app

```sh
vtex publish
```

## 4. Install it

```sh
vtex install youraccount.gopersonal-search-resolver@1.x
```

## 5. Configure the project id and review the app settings

In the VTEX admin, go to **Apps → My apps → GoPersonal Search Resolver →
Settings**, then:

1. Set **GoPersonal project id** to the id GoPersonal gave you.
2. Leave **Use GoPersonal as the search engine** ticked.
3. Review the remaining settings against the store's catalog and language — see
   [Admin settings](#admin-settings) below.

Settings are per workspace and take effect immediately — no republish.

---

# Admin settings

Until the settings form is saved for the first time, the app uses each setting's
default, listed here. The title settings must match the catalog's own wording:
they are both what the storefront sidebar renders and the keys used to suppress
duplicate specifications.

| Setting | Default | What it does |
| --- | --- | --- |
| Use GoPersonal as the search engine | checked | The only place the engine is chosen. Unticked, full-text queries go to VTEX Intelligent Search. It also falls back to VTEX on its own when no project id is set, so you can install the app and keep Intelligent Search until you are ready to switch. |
| GoPersonal project id | *(empty)* | The GoPersonal project answering queries. |
| Filter sorting locale | `es` | Locale used to alphabetize filter groups, so accented letters land where the store's language expects them. |
| Brand filter title | `Marca` | Title of the brand filter. Specifications with this same name are dropped, since they duplicate the brand the product already carries. |
| Price filter title | `Precio` | Title of the price range filter. |
| Category filter titles, by level | `Departamento`, `Categoría`, `Sub-Categoría` | One title per category tree level, broadest first. Deeper levels reuse the third name followed by their depth. |
| First category level offered as a filter | `2` | Levels shallower than this are not offered as filters, which hides the top level shoppers already navigated through. |
| Filter order | `Marca`, `Categoría`, `Sub-Categoría`, `Precio`, `Color` | Filters pinned to the top, in this order; the rest follow alphabetically. |
| Placeholder price to exclude | `9999999` | Price the catalog stores for never-priced products. Products at this exact price are left out of the price slider, so a single one does not stretch it. Set it to `0` if the catalog has no such placeholder. |
