---
category: Overlays
---

# DropdownMenu

Contextual action menu. Compose with the DropdownMenu* parts.

```tsx
<DropdownMenu>
  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm"><MoreHorizontal /></Button>} />
  <DropdownMenuContent>
    <DropdownMenuLabel>Candidate</DropdownMenuLabel>
    <DropdownMenuItem>View profile</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem variant="destructive">Reject</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```
