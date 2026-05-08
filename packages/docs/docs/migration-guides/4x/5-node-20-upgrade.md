---
id: node-20-upgrade
title: Node.js 20 Upgrade
---

# Node.js 20 Upgrade

## Overview

Cornerstone3D 4.x requires Node.js 20 or higher. This is an upgrade from the previous requirement of Node.js 18.

## Changes Required

### Update Node Version

Update your local development environment to use Node.js 20 or higher:

```bash
# Using nvm (Node Version Manager)
nvm install 20
nvm use 20

# Or install directly from nodejs.org
```

### Update Package.json

Update your `package.json` engines field:

```json
{
  "engines": {
    "node": ">=20"
  }
}
```
