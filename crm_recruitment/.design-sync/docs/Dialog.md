---
category: Overlays
---

# Dialog

Modal dialog. Compose with the Dialog* parts.

```tsx
<Dialog>
  <DialogTrigger render={<Button>Reject candidate</Button>} />
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Reject Ayesha Khan?</DialogTitle>
      <DialogDescription>This moves the candidate out of the active pipeline.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <DialogClose render={<Button variant="outline">Cancel</Button>} />
      <Button variant="destructive">Reject</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

DialogContent already includes its portal and overlay. Triggers take a `render` prop (Base UI), not `asChild`.
