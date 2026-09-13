import { Button } from "crm_recruitment"
import { Plus, ArrowRight, Trash2, Search } from "lucide-react"

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button>Save candidate</Button>
    <Button variant="outline">Filter</Button>
    <Button variant="secondary">Add note</Button>
    <Button variant="ghost">Skip</Button>
    <Button variant="destructive">Reject</Button>
    <Button variant="link">View résumé</Button>
  </div>
)

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button size="xs">Extra small</Button>
    <Button size="sm">Small</Button>
    <Button size="default">Default</Button>
    <Button size="lg">Large</Button>
  </div>
)

export const WithIcons = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button>
      <Plus />
      New candidate
    </Button>
    <Button variant="outline">
      Next stage
      <ArrowRight />
    </Button>
    <Button variant="destructive">
      <Trash2 />
      Remove
    </Button>
  </div>
)

export const IconOnly = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button size="icon-xs" variant="ghost">
      <Search />
    </Button>
    <Button size="icon-sm" variant="outline">
      <Plus />
    </Button>
    <Button size="icon">
      <Plus />
    </Button>
    <Button size="icon-lg" variant="secondary">
      <Search />
    </Button>
  </div>
)

export const Disabled = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button disabled>Save candidate</Button>
    <Button variant="outline" disabled>
      Filter
    </Button>
    <Button variant="destructive" disabled>
      Reject
    </Button>
  </div>
)
