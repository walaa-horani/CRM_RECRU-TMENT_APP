import { Badge } from "crm_recruitment"
import { Check, Clock, X } from "lucide-react"

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>Offer</Badge>
    <Badge variant="secondary">Screening</Badge>
    <Badge variant="destructive">Rejected</Badge>
    <Badge variant="outline">Draft</Badge>
    <Badge variant="ghost">Archived</Badge>
    <Badge variant="link">View</Badge>
  </div>
)

export const PipelineStages = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="secondary">Applied</Badge>
    <Badge variant="secondary">Screening</Badge>
    <Badge variant="secondary">Interview</Badge>
    <Badge>Offer</Badge>
    <Badge variant="destructive">Rejected</Badge>
  </div>
)

export const WithIcons = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>
      <Check />
      Verified
    </Badge>
    <Badge variant="secondary">
      <Clock />
      Awaiting reply
    </Badge>
    <Badge variant="destructive">
      <X />
      Withdrawn
    </Badge>
  </div>
)
