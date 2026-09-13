import {
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "crm_recruitment"

export const Default = () => (
  <Tabs defaultValue="profile" className="w-96">
    <TabsList>
      <TabsTrigger value="profile">Profile</TabsTrigger>
      <TabsTrigger value="notes">Notes</TabsTrigger>
      <TabsTrigger value="activity">Activity</TabsTrigger>
    </TabsList>
    <TabsContent value="profile" className="pt-3 text-muted-foreground">
      Senior Frontend Engineer, 8 years experience. Referred by Omar.
    </TabsContent>
    <TabsContent value="notes" className="pt-3 text-muted-foreground">
      Strong systems thinking; wants remote-first.
    </TabsContent>
  </Tabs>
)

export const WithCounts = () => (
  <Tabs defaultValue="active" className="w-[28rem]">
    <TabsList>
      <TabsTrigger value="active">
        Active
        <Badge variant="secondary">24</Badge>
      </TabsTrigger>
      <TabsTrigger value="offer">
        Offer
        <Badge variant="secondary">3</Badge>
      </TabsTrigger>
      <TabsTrigger value="archived">
        Archived
        <Badge variant="secondary">118</Badge>
      </TabsTrigger>
    </TabsList>
    <TabsContent value="active" className="pt-3 text-muted-foreground">
      24 candidates currently moving through the pipeline.
    </TabsContent>
  </Tabs>
)
