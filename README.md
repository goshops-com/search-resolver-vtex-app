# gopersonal-search-resolver

VTEX IO app implementing the **GraphQL resolvers** for the catalog, search, and orders schema published by `vtex.search-graphql`. It powers PDP, PLP, autocomplete, and Intelligent Search storefront contracts.

This fork routes full-text search to **GoPersonal** instead of VTEX Intelligent Search. Category pages, PDP and autocomplete always go to VTEX.

This is the **resolver layer** of the search stack:

- Schema (the contract): `vtex.search-graphql`
- Resolvers (this app): `gopersonal-search-resolver`, a fork of `vtex.search-resolver`
- Backend HTTP wrapper: `vtex.intelligent-search-api`
- Storefront consumer: `vtex.search-result` (PLP), `vtex.delivery-promise-components` (postal/pickup)

---

# Installation

Installing this app is what switches the store's search provider. **No store-theme
change is needed**: the storefront asks `vtex.search-graphql` for results, and the
platform routes that to whichever search-resolver app is installed on the account.
Replacing the app replaces the engine.

> ⚠️ **A workspace can only have one search-resolver installed.** If two are
> present the workspace breaks — this is a documented VTEX limitation, not a bug
> in this app. Step 4 is therefore mandatory, not optional.
>
> Do the whole process in a **development workspace first**. Step 4 uninstalls
> the store's current search resolver, and on `master` that takes search down
> for real shoppers until step 6 finishes.

### Before you start

Ask GoPersonal for the **project id** — it identifies the project that will answer
queries, and the app falls back to VTEX Intelligent Search without it.

You need [Node.js 20](https://nodejs.org/) (`nvm use`), [Yarn](https://yarnpkg.com/) v1,
and the [VTEX Toolbelt](https://github.com/vtex/toolbelt) (`npm i -g vtex`).

---

## 1. Get the code

```sh
git clone <this-repo> gopersonal-search-resolver
cd gopersonal-search-resolver
yarn install
```

## 2. Set the vendor

A VTEX app is identified by `vendor.name`, and **the vendor must be an account you
can publish from** — it has to match the account you are logged into when you run
`vtex publish`.

In `manifest.json`, change `"vendor"` to that account:

```json
{
  "vendor": "youraccount",
  "name": "gopersonal-search-resolver",
  "version": "1.104.0"
}
```

Two ways to go about it:

- **The store publishes for itself** — set the vendor to the store's account. Simplest, but each store then maintains its own copy.
- **A partner publishes once for many stores** — set the vendor to the partner account and share the app with each store (`vtex add`/`vtex install` against the shared app). Then only the partner republishes on updates.

Confirm which account you are on with `vtex whoami`.

## 3. Create a development workspace

```sh
vtex login {accountName}
vtex use search-migration          # creates it if it does not exist
```

Everything from here until step 7 happens in this workspace.

## 4. Uninstall the current search resolver

```sh
vtex list                          # find the installed search-resolver
vtex uninstall vtex.search-resolver
```

Search on this workspace is now down. That is expected — step 6 restores it.

## 5. Publish the app

```sh
vtex publish
```

To try it before publishing, use `vtex link` instead: it runs the app from your
machine in the current workspace, which is the fastest way to validate steps 6-8.

## 6. Install it

```sh
vtex install youraccount.gopersonal-search-resolver@1.x
```

Verify only one is installed:

```sh
vtex list | grep search-resolver
```

## 7. Configure the project id

In the VTEX admin, go to **Apps → My apps → GoPersonal Search Resolver →
Settings**, then:

1. Set **GoPersonal project id** to the id GoPersonal gave you.
2. Leave **Use GoPersonal as the search engine** ticked.
3. Review the filter settings below against the store's language.

Settings are per workspace and take effect immediately — no republish.

Until this form is saved for the first time, the app uses each setting's default,
listed here. Their titles must match the catalog's own wording: they are both what
the storefront sidebar renders and the keys used to suppress duplicate specifications.

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

## 8. Install the GoPersonal SDK on the storefront

**Optional — search works without this.** The SDK is what makes results
*personalized*; skipping it means every shopper gets the same anonymous ranking.

GoPersonal provides a browser SDK that keeps the shopper's session in
`localStorage`, which never reaches this service on its own. The storefront has to
carry it across in one of three ways, which the app reads in this order of
precedence:

1. **Request headers** — `x-gopersonal-customer-id` and `x-gopersonal-session-id`:

   ```js
   const session = window.gsSDK.getSession()
   // x-gopersonal-customer-id: session.customer_id || session.vuuid
   // x-gopersonal-session-id:  session.sessionId
   ```

2. **A `gopersonal` cookie** written by a bridge snippet that mirrors
   `gsSDK.getSession()` into it.
3. **The SDK's own `gs-v-1` cookie**, read automatically — but this mirror is
   gated behind a GoPersonal-side allowlist of client ids and is off by default.

`customer_id` only exists after the shopper goes through `gsSDK.login()`; before
that `vuuid` identifies the anonymous visitor, so the same person stays
recognizable across the login boundary.

Ask GoPersonal for the SDK loader and the bridge snippet — neither ships in this
repo, and whether option 3 is enabled for your client id is their call.

## 9. Promote to production

Once search is verified in the development workspace:

```sh
vtex workspace promote
```

Then repeat steps 4, 6 and 7 on `master` if the promotion does not carry the
install and settings across — installs and app settings are per workspace.

---

# Rolling back

Reinstalling the VTEX resolver restores the original search:

```sh
vtex uninstall youraccount.gopersonal-search-resolver
vtex install vtex.search-resolver@1.x
```

For a softer rollback that keeps the app in place, just untick **Use GoPersonal as
the search engine** in the admin settings. Full-text queries go back to VTEX
Intelligent Search immediately, with no uninstall.

---

# Build-time configuration

`config.json` at the repo root holds what the app cannot change at runtime. It is
read at build time by `node/config.ts`, so editing it requires a new publish, and
stores get whatever it was built with.

| Key | What it does |
| --- | --- |
| `gopersonal.baseUrl` | Host the search API is called on. Changing it also requires updating the matching `outbound-access` policy in `manifest.json`, which is what grants the app access to the host. |
| `gopersonal.limit` | Size of the ranked set requested from GoPersonal. Lower is faster, and caps how many products a query can return. |

---

# Development

```sh
make dev      # install dependencies and refresh VTEX IO typings
make link     # link the app to your development workspace
make test     # unit tests (Jest + ts-jest, in node/)
make check    # pre-PR gate: lint + test, same as `yarn verify`
make help     # every available target
```

E2E tests run via the [`vtex/search-tests`](https://github.com/vtex/search-tests)
Cypress suite on PR.

Version bumps use `vtex release <patch|minor|major> stable`; `vtex deploy`
promotes a release candidate to stable.

---

# Reference

- **Custom search resolver recipe:** [VTEX developer docs](https://developers.vtex.com/docs/guides/external-search-provider-recipe)
- **Schema-of-record:** [vtex/search-graphql](https://github.com/vtex-apps/search-graphql)
- **Changelog:** [`CHANGELOG.md`](CHANGELOG.md)
