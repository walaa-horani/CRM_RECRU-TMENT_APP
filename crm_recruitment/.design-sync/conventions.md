# Building with this design system

A recruitment-CRM component library: shadcn (`base-nova` style) on top of Base UI
primitives, styled with Tailwind v4 utilities bound to semantic CSS variables.

## Setup — there is no provider

Components read no React context of their own. Do **not** wrap the app in a
ThemeProvider or any `*Provider`; none is exported and none is needed. Import a
component and render it.

Theming is class-based, not context-based:

```tsx
// Dark mode = put `dark` on an ancestor. Nothing else switches themes.
<div className="dark bg-background text-foreground">
  <Button>Save candidate</Button>
</div>
```

Always set `bg-background text-foreground` on your page root. The tokens are
defined on `:root` (and re-defined under `.dark`) in the shipped stylesheet; a
container that sets neither inherits the browser default and looks unstyled.

Fonts ship with the system and are already bound to the token vars: `font-sans`
(DM Sans, the default), `font-heading` (Noto Serif — what `CardTitle` uses), and
`font-mono` (Geist Mono).

## Styling idiom — Tailwind utilities over semantic tokens

Style your own layout with Tailwind classes. Never hardcode a hex colour; use the
semantic families below, which resolve to the brand tokens in both themes.

| Family | Real names available |
|---|---|
| Surface | `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-primary`, `bg-secondary`, `bg-accent`, `bg-destructive`, `bg-sidebar` |
| Text | `text-foreground`, `text-muted-foreground`, `text-card-foreground`, `text-popover-foreground`, `text-primary`, `text-primary-foreground`, `text-secondary-foreground`, `text-accent-foreground`, `text-destructive` |
| Line | `border-border`, `border-input`, `ring-ring`, `divide-border` |
| Charts | `bg-chart-1` … `bg-chart-5` (also `text-`/`fill-`/`stroke-`) |
| Opacity | any of the above with `/5` … `/90`, e.g. `bg-primary/10`, `ring-foreground/10` |
| Variants | `hover:`, `focus-visible:`, `active:`, `disabled:`, `group-hover:`, `dark:` on the same names |
| Radius | `rounded-sm|md|lg|xl|2xl|3xl|full` (scaled from `--radius`) |
| Type | `text-xs` … `text-6xl`, `font-light|normal|medium|semibold|bold`, `font-sans|heading|mono` |
| Layout | `flex`, `grid`, `grid-cols-1..12`, `gap-0..16`, `p-*`/`m-*` `0..16`, `w-*`, `max-w-xs..7xl`, `space-y-*`, plus `sm:`/`md:`/`lg:` on the common ones |

Layout, spacing and responsive utilities are pre-generated, so anything in the
table above resolves even though this repo never used it.

## Where the truth lives

- `styles.css` and its imports — the token definitions (`--primary`,
  `--background`, `--card`, `--muted`, `--destructive`, `--radius`,
  `--font-sans`, `--font-heading` …) for light and dark, the brand `@font-face`
  rules, and every component's own compiled CSS. Read it before inventing a colour.
- `components/<group>/<Name>/<Name>.prompt.md` — per-component usage, with a
  composition example for each of the ten roots (Button, Badge, Input, Select,
  Card, Table, Avatar, Dialog, DropdownMenu, Tabs).
- `components/<group>/<Name>/<Name>.d.ts` — the exact prop contract.

Icons: `lucide-react` is bundled into the same global as the components, so any
lucide icon can be used directly. Buttons and badges auto-size an `svg` child —
do not set icon width/height yourself.

## API rules that are easy to get wrong

These come from Base UI and will silently break output if ignored:

1. **Triggers take `render`, not `asChild`.**
   `<DialogTrigger render={<Button>Open</Button>} />`, same for `DialogClose`
   and `DropdownMenuTrigger`.
2. **`DropdownMenuLabel` must be inside a `DropdownMenuGroup`** — outside one,
   Base UI throws "MenuGroupContext is missing" and nothing renders.
3. **`SelectContent` defaults to `alignItemWithTrigger`**, which overlays the
   list on top of the trigger. Pass `alignItemWithTrigger={false}` for a normal
   dropdown below the trigger.
4. **`DropdownMenuContent` inherits the trigger's width.** With an icon-sized
   trigger the items wrap — give it a width, e.g. `className="w-56"`.
5. **`Card size="sm"` downsizes `CardTitle`** through a `group-data` variant that
   outranks a plain `text-2xl`. For a large number in a compact card, put the
   value in `CardContent`, not `CardTitle`.
6. `DialogContent` already renders its own portal, overlay and close button —
   do not add `DialogPortal`/`DialogOverlay` around it.

## An idiomatic screen

```tsx
<div className="flex flex-col gap-4 bg-background p-6 text-foreground">
  <div className="flex items-center justify-between">
    <h2 className="font-heading text-xl">Candidates</h2>
    <Button><Plus />New candidate</Button>
  </div>

  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
    <Card>
      <CardHeader><CardDescription>Applications</CardDescription></CardHeader>
      <CardContent className="text-3xl leading-none font-medium">1,284</CardContent>
    </Card>
  </div>

  <Card className="p-0">
    <Table>
      <TableHeader>
        <TableRow><TableHead>Candidate</TableHead><TableHead>Stage</TableHead></TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>
            <div className="flex items-center gap-2">
              <Avatar className="size-6"><AvatarFallback className="text-xs">AK</AvatarFallback></Avatar>
              Ayesha Khan
            </div>
          </TableCell>
          <TableCell><Badge variant="secondary">Interview</Badge></TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </Card>
</div>
```
