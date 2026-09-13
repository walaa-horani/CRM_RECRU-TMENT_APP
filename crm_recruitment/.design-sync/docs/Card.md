---
category: Layout
---

# Card

Surface container for grouped content. Compose with the Card* parts.

```tsx
<Card>
  <CardHeader>
    <CardTitle>Ayesha Khan</CardTitle>
    <CardDescription>Senior Frontend Engineer</CardDescription>
    <CardAction><Button variant="ghost" size="icon-sm"><MoreHorizontal /></Button></CardAction>
  </CardHeader>
  <CardContent>Applied 3 days ago - Referral</CardContent>
  <CardFooter><Button size="sm">Advance</Button></CardFooter>
</Card>
```

`size="sm"` tightens internal spacing via `--card-spacing`. CardFooter is a muted bar; an `img` as first or last child gets rounded corners automatically.
