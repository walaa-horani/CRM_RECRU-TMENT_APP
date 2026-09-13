---
category: Actions
---

# Button

Primary interactive control. Six visual variants and eight sizes, including icon-only sizes.

```tsx
<Button variant="default" size="default">Save candidate</Button>
<Button variant="outline" size="sm">Filter</Button>
<Button variant="ghost" size="icon"><Plus /></Button>
```

Variants: `default` (filled primary), `outline`, `secondary`, `ghost`, `destructive` (tinted, not solid), `link`.
Sizes: `xs` `sm` `default` `lg`, plus `icon` `icon-xs` `icon-sm` `icon-lg` for square icon-only buttons.
An `svg` child is auto-sized - do not set icon dimensions yourself.
