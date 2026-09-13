import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "crm_recruitment"
import { MoreHorizontal, SlidersHorizontal } from "lucide-react"

// `open` renders the menu statically for the card; in an app leave it
// uncontrolled and let DropdownMenuTrigger drive it.
export const CandidateActions = () => (
  <DropdownMenu open>
    <DropdownMenuTrigger
      render={
        <Button variant="ghost" size="icon-sm">
          <MoreHorizontal />
        </Button>
      }
    />
    <DropdownMenuContent className="w-56">
      <DropdownMenuGroup>
        {/* DropdownMenuLabel must be inside a DropdownMenuGroup - Base UI
            throws "MenuGroupContext is missing" otherwise. */}
        <DropdownMenuLabel>Ayesha Khan</DropdownMenuLabel>
        <DropdownMenuItem>
          View profile
          <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          Move to interview
          <DropdownMenuShortcut>⌘I</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>Add note</DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive">Reject candidate</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)

export const ColumnFilters = () => (
  <DropdownMenu open>
    <DropdownMenuTrigger
      render={
        <Button variant="outline" size="sm">
          <SlidersHorizontal />
          Columns
        </Button>
      }
    />
    <DropdownMenuContent className="w-56">
      <DropdownMenuGroup>
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked>Candidate</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked>Stage</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Source</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Last activity</DropdownMenuCheckboxItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
)
