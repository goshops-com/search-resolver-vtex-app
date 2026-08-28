# Adding a Custom Page to VTEX IO My Account

This guide explains how to create a custom app to extend VTEX IO My Account with new pages and menu items.

## Custom App Structure

```
my-account-custom/
├── manifest.json
├── store/
│   ├── interfaces.json
│   └── plugins.json
├── react/
│   ├── MyCustomPage.tsx
│   ├── MyCustomLink.tsx
│   └── components/
│       └── MyComponent.tsx
└── messages/
    ├── en.json
    ├── es.json
    └── pt.json
```

## Step 1: Create manifest.json

```json
{
  "name": "my-account-custom",
  "vendor": "your-vendor",
  "version": "0.1.0",
  "title": "My Account Custom Page",
  "description": "Custom page for My Account",
  "builders": {
    "react": "3.x",
    "messages": "1.x",
    "store": "0.x"
  },
  "dependencies": {
    "vtex.my-account-commons": "1.x",
    "vtex.styleguide": "9.x",
    "vtex.css-handles": "0.x"
  },
  "$schema": "https://raw.githubusercontent.com/vtex/node-vtex-api/master/gen/manifest.schema"
}
```

## Step 2: Define Interfaces

Create `store/interfaces.json`:

```json
{
  "my-account-link.custom-link": {
    "component": "MyCustomLink"
  },
  "my-account-page.custom-page": {
    "component": "MyCustomPage"
  }
}
```

## Step 3: Register Plugins

Create `store/plugins.json`:

```json
{
  "my-account-menu > my-account-link": "my-account-link.custom-link",
  "my-account-pages > my-account-page": "my-account-page.custom-page"
}
```

## Step 4: Create Page Component

Create `react/MyCustomPage.tsx`:

```typescript
import React, { Fragment } from 'react'
import { Route } from 'vtex.my-account-commons/Router'
import MyComponent from './components/MyComponent'

const MyCustomPage = () => (
  <Fragment>
    <Route path="/my-custom-section" exact component={MyComponent} />
  </Fragment>
)

export default MyCustomPage
```

## Step 5: Create Link Component

Create `react/MyCustomLink.tsx`:

```typescript
import React from 'react'
import { FormattedMessage } from 'react-intl'

interface Props {
  render: (links: Array<{ name: string; path: string }>) => void
}

const MyCustomLink: React.FC<Props> = ({ render }) => {
  return render([
    {
      name: <FormattedMessage id="custom-page.link" />,
      path: '/my-custom-section',
    },
  ])
}

export default MyCustomLink
```

## Step 6: Create Your Component

Create `react/components/MyComponent.tsx`:

```typescript
import React from 'react'
import { FormattedMessage } from 'react-intl'
import { ContentWrapper } from 'vtex.my-account-commons'

const MyComponent: React.FC = () => {
  return (
    <ContentWrapper>
      {({ handleError }) => (
        <div className="pa5">
          <h1 className="f3 f1-ns fw6 gray">
            <FormattedMessage id="custom-page.title" />
          </h1>
          <p>Your custom content here</p>
        </div>
      )}
    </ContentWrapper>
  )
}

export default MyComponent
```

## Step 7: Add Translations

Create `messages/en.json`:

```json
{
  "custom-page.link": "My Custom Section",
  "custom-page.title": "Welcome to Your Custom Section"
}
```

Create `messages/es.json`:

```json
{
  "custom-page.link": "Mi Sección Personalizada",
  "custom-page.title": "Bienvenido a Tu Sección Personalizada"
}
```

## Step 8: Update Store Theme

In your store-theme's `manifest.json`, add the custom app as a dependency:

```json
{
  "dependencies": {
    "vtex.store": "2.x",
    "vtex.my-account": "1.x",
    "your-vendor.my-account-custom": "0.x"
  }
}
```

**Note:** No changes are needed in block files. The app registers automatically through the plugin system.

## Development Commands

```bash
# Link your custom app
cd my-account-custom
vtex link

# In another terminal, browse your store
vtex browse
```

## Accessing Your Page

Once linked, access your custom page at:

```
https://your-store.myvtex.com/account#/my-custom-section
```

The link will automatically appear in the My Account sidebar menu.

## Multiple Pages Example

You can add multiple routes in the same page component:

```typescript
const MyCustomPage = () => (
  <Fragment>
    <Route path="/section-one" exact component={ComponentOne} />
    <Route path="/section-two" exact component={ComponentTwo} />
  </Fragment>
)
```

And multiple links:

```typescript
const MyCustomLink: React.FC<Props> = ({ render }) => {
  return render([
    {
      name: <FormattedMessage id="section-one.link" />,
      path: '/section-one',
    },
    {
      name: <FormattedMessage id="section-two.link" />,
      path: '/section-two',
    },
  ])
}
```

## Important: ContentWrapper Requirements

The `ContentWrapper` component from `vtex.my-account-commons` has specific requirements that you must follow:

### 1. Check Component Requirements

The `ContentWrapper` requires a `titleId` prop for the page header. Always check what props are mandatory when using VTEX components.

### 2. Follow the Correct Pattern

The correct implementation pattern uses `titleId` and `handleError` in the callback:

```tsx

  {({ handleError }) => (
    ...
  )}

```

### 3. React Intl Errors = Missing Translation IDs

When you see `An id must be provided to format a message`, it means a component expecting a translation key didn't receive one.

### Quick Reference for ContentWrapper

```tsx
// Always include titleId - it's required!

  {({ handleError }) => (
    
  )}

```

And don't forget to add the translation key to your `messages/en.json`:

```json
{
  "your-translation-key": "Page Title"
}
```

## Troubleshooting

- **Link not appearing:** Make sure your custom app is properly linked and the store theme has it as a dependency
- **Page not loading:** Check that the path in `MyCustomPage` matches the path in `MyCustomLink`
- **Translation missing:** Verify that message IDs match between your components and message files

## Additional Resources

- [VTEX IO Documentation](https://developers.vtex.com/docs/guides/vtex-io-documentation-what-is-vtex-io)
- [My Account Official Repository](https://github.com/vtex-apps/my-account)
- [VTEX Styleguide](https://styleguide.vtex.com/)
