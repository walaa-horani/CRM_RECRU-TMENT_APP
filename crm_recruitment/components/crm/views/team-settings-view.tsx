"use client";

import { useState } from "react";
import { Building, Settings, UserPlus, Users } from "lucide-react";
import { OrganizationProfile, useClerk } from "@clerk/nextjs";
import { OrganizationsTable } from "@/components/crm/organizations-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Role } from "@/lib/crm/data";
import { useCrm } from "@/lib/crm/store";
import { cn } from "@/lib/utils";

function roleBtnCls(active: boolean) {
  return cn(
    "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );
}

export function TeamSettingsView() {
  const { data, tenantId, role, inviteMember } = useCrm();
  const clerk = useClerk();
  const tenant = data[tenantId];
  const isAdmin = role === "admin";

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [formRole, setFormRole] = useState<Role>("recruiter");

  const submit = () => {
    if (name && email) {
      inviteMember(name, email, formRole);
      setName("");
      setEmail("");
      setFormRole("recruiter");
      setOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Team &amp; Settings</h1>
          <p className="text-sm text-muted-foreground">{tenant.name}</p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => clerk.openOrganizationProfile()}
            className="inline-flex items-center gap-1.5"
          >
            <Settings className="size-4" />
            Manage Roles & Invitations
          </Button>

          {isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
                <UserPlus className="size-3.5" />
                Quick Invite
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite a teammate</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3 py-2">
                  <Input
                    placeholder="Full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Input
                    placeholder="Work email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <div className="flex gap-1 rounded-md bg-muted p-0.5">
                    <button
                      className={roleBtnCls(formRole === "recruiter")}
                      onClick={() => setFormRole("recruiter")}
                    >
                      Recruiter
                    </button>
                    <button
                      className={roleBtnCls(formRole === "coordinator")}
                      onClick={() => setFormRole("coordinator")}
                    >
                      Coordinator
                    </button>
                    <button
                      className={roleBtnCls(formRole === "admin")}
                      onClick={() => setFormRole("admin")}
                    >
                      Admin
                    </button>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose
                    className="inline-flex items-center rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
                    onClick={submit}
                  >
                    Send invite
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="roster" className="w-full">
        <TabsList className="mb-2">
          <TabsTrigger value="roster" className="gap-2">
            <Users className="size-4" />
            Agency Members
          </TabsTrigger>
          <TabsTrigger value="organizations" className="gap-2">
            <Building className="size-4" />
            All Organizations &amp; Plans
          </TabsTrigger>
          <TabsTrigger value="clerk-profile" className="gap-2">
            <Settings className="size-4" />
            Organization Profile &amp; Invitations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster">
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenant.team.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="size-6">
                          <AvatarFallback className="text-[10px]">{m.initials}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{m.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize">
                        {m.role}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          m.status === "active"
                            ? "bg-secondary text-secondary-foreground"
                            : "border border-dashed border-border text-muted-foreground",
                        )}
                      >
                        {m.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="organizations" className="pt-2">
          <OrganizationsTable />
        </TabsContent>

        <TabsContent value="clerk-profile" className="pt-2">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <OrganizationProfile routing="hash" />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
