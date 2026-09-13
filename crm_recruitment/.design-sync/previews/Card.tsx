import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "crm_recruitment"
import { MoreHorizontal, Mail, MapPin } from "lucide-react"

export const CandidateCard = () => (
  <Card className="w-80">
    <CardHeader>
      <CardTitle>Ayesha Khan</CardTitle>
      <CardDescription>Senior Frontend Engineer</CardDescription>
      <CardAction>
        <Button variant="ghost" size="icon-sm">
          <MoreHorizontal />
        </Button>
      </CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <MapPin className="size-3.5" />
        Karachi, Pakistan
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Mail className="size-3.5" />
        ayesha.khan@example.com
      </div>
    </CardContent>
    <CardFooter className="justify-between">
      <Badge variant="secondary">Interview</Badge>
      <Button size="sm">Advance</Button>
    </CardFooter>
  </Card>
)

export const WithAvatar = () => (
  <Card className="w-80">
    <CardHeader>
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarFallback>DM</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <CardTitle>Daniyal Mirza</CardTitle>
          <CardDescription>Applied 3 days ago · Referral</CardDescription>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      Eight years building design systems. Strong React and accessibility
      background, currently notice period of one month.
    </CardContent>
  </Card>
)

export const Compact = () => (
  <Card size="sm" className="w-72">
    <CardHeader>
      <CardTitle>Open roles</CardTitle>
      <CardDescription>Across all pipelines</CardDescription>
    </CardHeader>
    <CardContent className="text-3xl font-medium">24</CardContent>
  </Card>
)

export const Stat = () => (
  <div className="flex flex-wrap gap-3">
    {[
      ["Applications", "1,284"],
      ["Interviews", "96"],
      ["Offers", "12"],
    ].map(([label, value]) => (
      <Card key={label} className="w-44">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
        </CardHeader>
        <CardContent className="text-3xl leading-none font-medium">
          {value}
        </CardContent>
      </Card>
    ))}
  </div>
)
