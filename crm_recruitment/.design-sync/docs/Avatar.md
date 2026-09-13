---
category: Data
---

# Avatar

User image with text fallback. Compose with AvatarImage and AvatarFallback.

```tsx
<Avatar>
  <AvatarImage src="/ayesha.jpg" alt="Ayesha Khan" />
  <AvatarFallback>AK</AvatarFallback>
</Avatar>
```

AvatarFallback shows while the image loads or when it fails, so always provide it. Use AvatarGroup to overlap several, with AvatarGroupCount for the overflow tally.
