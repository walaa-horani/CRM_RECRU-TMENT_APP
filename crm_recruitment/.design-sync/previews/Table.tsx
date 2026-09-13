import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "crm_recruitment"
import { MoreHorizontal } from "lucide-react"

const rows = [
  { name: "Ayesha Khan", initials: "AK", role: "Senior Frontend Engineer", stage: "Interview", owner: "Sara" },
  { name: "Daniyal Mirza", initials: "DM", role: "Design Systems Engineer", stage: "Screening", owner: "Omar" },
  { name: "Hina Raza", initials: "HR", role: "Product Designer", stage: "Offer", owner: "Sara" },
  { name: "Bilal Ahmed", initials: "BA", role: "Backend Engineer", stage: "Applied", owner: "Zoya" },
]

export const CandidatePipeline = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Candidate</TableHead>
        <TableHead>Role</TableHead>
        <TableHead>Stage</TableHead>
        <TableHead>Recruiter</TableHead>
        <TableHead className="text-right">Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((r) => (
        <TableRow key={r.name}>
          <TableCell>
            <div className="flex items-center gap-2">
              <Avatar className="size-6">
                <AvatarFallback className="text-xs">{r.initials}</AvatarFallback>
              </Avatar>
              {r.name}
            </div>
          </TableCell>
          <TableCell className="text-muted-foreground">{r.role}</TableCell>
          <TableCell>
            <Badge variant={r.stage === "Offer" ? "default" : "secondary"}>{r.stage}</Badge>
          </TableCell>
          <TableCell className="text-muted-foreground">{r.owner}</TableCell>
          <TableCell className="text-right">
            <Button variant="ghost" size="icon-sm">
              <MoreHorizontal />
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
)

export const WithCaptionAndFooter = () => (
  <Table>
    <TableCaption>Requisitions open this quarter.</TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead>Role</TableHead>
        <TableHead>Department</TableHead>
        <TableHead className="text-right">Openings</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>Frontend Engineer</TableCell>
        <TableCell className="text-muted-foreground">Engineering</TableCell>
        <TableCell className="text-right">4</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>Product Designer</TableCell>
        <TableCell className="text-muted-foreground">Design</TableCell>
        <TableCell className="text-right">2</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>Recruiter</TableCell>
        <TableCell className="text-muted-foreground">People</TableCell>
        <TableCell className="text-right">1</TableCell>
      </TableRow>
    </TableBody>
    <TableFooter>
      <TableRow>
        <TableCell colSpan={2}>Total</TableCell>
        <TableCell className="text-right">7</TableCell>
      </TableRow>
    </TableFooter>
  </Table>
)
