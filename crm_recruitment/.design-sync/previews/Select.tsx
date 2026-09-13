import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "crm_recruitment"

export const Closed = () => (
  <div className="flex w-64 flex-col gap-2">
    <Select>
      <SelectTrigger>
        <SelectValue placeholder="Pipeline stage" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="applied">Applied</SelectItem>
        <SelectItem value="interview">Interview</SelectItem>
      </SelectContent>
    </Select>
    <Select disabled>
      <SelectTrigger>
        <SelectValue placeholder="Locked to Engineering" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="eng">Engineering</SelectItem>
      </SelectContent>
    </Select>
  </div>
)

// `open` renders the list statically for the card; in an app leave it
// uncontrolled and let SelectTrigger drive it.
export const Open = () => (
  <Select open>
    <SelectTrigger className="w-64">
      <SelectValue placeholder="Pipeline stage" />
    </SelectTrigger>
    {/* alignItemWithTrigger defaults to true, which overlays the list on the
        trigger; false drops it below so the whole list is visible. */}
    <SelectContent alignItemWithTrigger={false}>
      <SelectGroup>
        <SelectLabel>Active</SelectLabel>
        <SelectItem value="applied">Applied</SelectItem>
        <SelectItem value="screening">Screening</SelectItem>
        <SelectItem value="interview">Interview</SelectItem>
        <SelectItem value="offer">Offer</SelectItem>
      </SelectGroup>
      <SelectSeparator />
      <SelectGroup>
        <SelectLabel>Closed</SelectLabel>
        <SelectItem value="hired">Hired</SelectItem>
        <SelectItem value="rejected">Rejected</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
)
