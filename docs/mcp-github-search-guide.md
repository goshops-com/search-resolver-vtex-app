# MCP GitHub Search Tool Guide for VTEX IO

This guide shows you how to use the MCP GitHub search tool (`mcp__grep__searchGitHub`) to find code patterns in VTEX IO custom apps.

## Table of Contents

1. [Overview](#overview)
2. [Tool Parameters](#tool-parameters)
3. [Common VTEX IO Search Patterns](#common-vtex-io-search-patterns)
4. [Advanced Patterns](#advanced-patterns)
5. [Best Practices](#best-practices)
6. [Troubleshooting](#troubleshooting)

## Overview

Search for code patterns across VTEX IO custom apps in the `vtex-apps` GitHub organization. This helps you find implementation examples, best practices, and architectural patterns used in production VTEX apps.

**Important**: Always include `repo: "vtex-apps/"` in your searches.

## Tool Parameters

### Required

- **`query`**: The code pattern to search for
- **`repo`**: Always use `"vtex-apps/"`

### Optional

- **`language`**: Filter by language: `["TypeScript"]`, `["TSX"]`, `["JavaScript"]`, `["JSON"]`, `["GraphQL"]`
- **`path`**: Filter by directory: `"react/"`, `"node/"`, `"graphql/"`
- **`useRegexp`**: Set to `true` for regex patterns
- **`matchCase`**: Set to `true` for case-sensitive search
- **`matchWholeWords`**: Set to `true` to match complete words only

## Common VTEX IO Search Patterns

### React Hooks

```javascript
query: "useState("
repo: "vtex-apps/"
language: ["TSX", "TypeScript"]
```

Find state management in VTEX IO React components.

### GraphQL Queries

```javascript
query: "useQuery"
repo: "vtex-apps/"
language: ["TSX", "TypeScript"]
path: "react/"
```

Find GraphQL query implementations in React components.

### GraphQL Mutations

```javascript
query: "useMutation"
repo: "vtex-apps/"
language: ["TSX", "TypeScript"]
path: "react/"
```

Find GraphQL mutation implementations.

### GraphQL Schema Definitions

```javascript
query: "type Query"
repo: "vtex-apps/"
language: ["GraphQL"]
path: "graphql/"
```

Find GraphQL schema query definitions.

### Node Resolvers

```javascript
query: "export const resolvers"
repo: "vtex-apps/"
language: ["TypeScript"]
path: "node/"
```

Find GraphQL resolver implementations in Node.js.

### Event Handlers

```javascript
query: "ctx.clients"
repo: "vtex-apps/"
language: ["TypeScript"]
path: "node/"
```

Find usage of VTEX IO clients in Node middleware.

### TypeScript Interfaces

```javascript
query: "export interface"
repo: "vtex-apps/"
language: ["TypeScript"]
```

Find TypeScript interface definitions.

### React Component Props

```javascript
query: "interface.*Props"
useRegexp: true
repo: "vtex-apps/"
language: ["TypeScript", "TSX"]
path: "react/"
```

Find React component prop interfaces.

### CSS Handles

```javascript
query: "useCssHandles"
repo: "vtex-apps/"
language: ["TSX", "TypeScript"]
path: "react/"
```

Find CSS Handles implementation in VTEX IO components.

### Manifest Configuration

```javascript
query: "\"builders\""
repo: "vtex-apps/"
language: ["JSON"]
path: "manifest.json"
```

Find builder configurations in VTEX IO app manifests.

## Advanced Patterns

### Multi-line useEffect with Cleanup

```javascript
query: "(?s)useEffect\\(\\(\\) => {.*return.*}"
useRegexp: true
repo: "vtex-apps/"
language: ["TSX", "TypeScript"]
```

Find useEffect hooks with cleanup functions. The `(?s)` prefix enables dotall mode for multi-line matching.

### GraphQL Type Definitions

```javascript
query: "(?s)type.*\\{.*field"
useRegexp: true
repo: "vtex-apps/"
language: ["GraphQL"]
```

Find complete GraphQL type definitions with fields.

### Node Middleware Patterns

```javascript
query: "(?s)export.*async.*\\(ctx.*\\)"
useRegexp: true
repo: "vtex-apps/"
language: ["TypeScript"]
path: "node/"
```

Find async middleware handlers in Node.js.

### Error Handling

```javascript
query: "(?s)try\\s*\\{.*catch"
useRegexp: true
repo: "vtex-apps/"
language: ["TypeScript"]
```

Find try-catch error handling patterns.

## Best Practices

### 1. Always Include vtex-apps Filter

```javascript
repo: "vtex-apps/"
```

Every search should include this to get VTEX IO-specific results.

### 2. Use Literal Code, Not Descriptions

✅ Good: `query: "useState("`  
❌ Bad: `query: "react hook for state"`

### 3. Start Broad, Then Narrow

```javascript
query: "useQuery"
repo: "vtex-apps/"

query: "useQuery"
repo: "vtex-apps/"
language: ["TSX"]
path: "react/"
```

### 4. Filter by Path for Specific Code

- React components: `path: "react/"`
- Node backend: `path: "node/"`
- GraphQL schemas: `path: "graphql/"`
- Configuration: `path: "manifest.json"`

### 5. Use Regex for Multi-line Patterns

For complex patterns spanning multiple lines, use `useRegexp: true` and prefix with `(?s)`:

```javascript
query: "(?s)useEffect\\(\\(\\) => {.*cleanup"
useRegexp: true
```

### 6. Escape Special Characters in Regex

- `\\(` for `(`
- `\\)` for `)`
- `\\[` for `[`
- `\\.` for `.`

## Troubleshooting

### No Results Found

Try:

1. Broader search pattern
2. Remove language filter
3. Check regex syntax (test at regex101.com)
4. Try `matchCase: false`

```javascript
query: "useQuery"
repo: "vtex-apps/"
language: ["TSX", "TypeScript"]
```

### Too Many Results

Add filters to narrow down:

```javascript
query: "useState"
repo: "vtex-apps/"
language: ["TSX"]
path: "react/"
```

### Regex Not Working

Make sure to:

1. Set `useRegexp: true`
2. Escape special characters: `\\(`, `\\)`, `\\[`, `\\]`
3. Use `(?s)` prefix for multi-line patterns

```javascript
query: "(?s)useEffect\\(\\(\\) => {.*return"
useRegexp: true
repo: "vtex-apps/"
```

---

Use this guide to find VTEX IO implementation patterns in the `vtex-apps` organization. Always include `repo: "vtex-apps/"` in your searches.
