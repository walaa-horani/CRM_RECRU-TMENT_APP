import { Button, Input } from "crm_recruitment"
import { Search } from "lucide-react"

export const Default = () => (
  <div className="flex w-72 flex-col gap-2">
    <Input placeholder="Search candidates" />
    <Input type="email" defaultValue="ayesha.khan@example.com" />
  </div>
)

export const States = () => (
  <div className="flex w-72 flex-col gap-2">
    <Input placeholder="Default" />
    <Input placeholder="Disabled" disabled />
    <Input defaultValue="not-an-email" aria-invalid />
  </div>
)

export const WithLabel = () => (
  <div className="flex w-72 flex-col gap-1.5">
    <label htmlFor="candidate-email" className="text-sm font-medium">
      Work email
    </label>
    <Input id="candidate-email" type="email" placeholder="name@company.com" />
    <p className="text-sm text-muted-foreground">
      Used for interview invitations.
    </p>
  </div>
)

export const SearchRow = () => (
  <div className="flex w-96 items-center gap-2">
    <Input placeholder="Filter by name or role" />
    <Button variant="outline">
      <Search />
      Search
    </Button>
  </div>
)
