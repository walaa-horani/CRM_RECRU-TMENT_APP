"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Building,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { CreateOrganization, useClerk, useOrganizationList } from "@clerk/nextjs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getOrganizationsWithPlans, type OrganizationItem } from "@/lib/actions/organizations";
import { cn } from "@/lib/utils";

export function OrganizationsTable({ className }: { className?: string }) {
  const clerk = useClerk();
  const { setActive } = useOrganizationList();
  const [orgs, setOrgs] = useState<OrganizationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<"all" | "pro" | "free">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getOrganizationsWithPlans();
      setOrgs(data);
    } catch (err) {
      console.error("Failed to load organizations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSwitch = async (orgId: string) => {
    if (!setActive) return;
    startTransition(async () => {
      try {
        await setActive({ organization: orgId });
        window.location.reload();
      } catch (err) {
        console.error("Failed to switch organization:", err);
      }
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredOrgs = orgs.filter((org) => {
    const matchesSearch =
      org.name.toLowerCase().includes(search.toLowerCase()) ||
      org.id.toLowerCase().includes(search.toLowerCase()) ||
      (org.slug && org.slug.toLowerCase().includes(search.toLowerCase()));

    const matchesPlan =
      planFilter === "all" ? true : org.plan === planFilter;

    return matchesSearch && matchesPlan;
  });

  const proCount = orgs.filter((o) => o.plan === "pro").length;
  const freeCount = orgs.filter((o) => o.plan === "free").length;
  const totalSeats = orgs.reduce((acc, o) => acc + (o.seatsPurchased || 0), 0);

  return (
    <div className={cn("flex flex-col gap-5", className)}>
      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Organizations</p>
              <p className="font-heading text-xl font-semibold">{orgs.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Pro Tier Agencies</p>
              <p className="font-heading text-xl font-semibold">{proCount}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <Shield className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Free Tier Agencies</p>
              <p className="font-heading text-xl font-semibold">{freeCount}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Users className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Active Seats Allocated</p>
              <p className="font-heading text-xl font-semibold">{totalSeats > 0 ? totalSeats : "Flexible"}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, slug or org ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>

          <div className="flex items-center rounded-lg border border-border bg-card p-1">
            <button
              onClick={() => setPlanFilter("all")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                planFilter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              All Plans ({orgs.length})
            </button>
            <button
              onClick={() => setPlanFilter("pro")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                planFilter === "pro" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Pro ({proCount})
            </button>
            <button
              onClick={() => setPlanFilter("free")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                planFilter === "free" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Free ({freeCount})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Plus className="size-4" />
              New Organization
            </DialogTrigger>
            <DialogContent className="max-w-lg p-6">
              <DialogHeader>
                <DialogTitle>Create New Organization</DialogTitle>
              </DialogHeader>
              <div className="pt-2">
                <CreateOrganization afterCreateOrganizationUrl="/crm" />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main Table */}
      <Card className="overflow-hidden p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[280px]">Organization</TableHead>
              <TableHead>Organization ID</TableHead>
              <TableHead>Actual Plan</TableHead>
              <TableHead>Subscription Status</TableHead>
              <TableHead>Seats Capacity</TableHead>
              <TableHead>Your Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="size-4 animate-spin text-primary" />
                    <span>Loading registered organizations and plans...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredOrgs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No organizations found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              filteredOrgs.map((org) => {
                const initials = org.name
                  .split(" ")
                  .map((w) => w[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase() || "OR";

                return (
                  <TableRow
                    key={org.id}
                    className={cn(
                      "transition-colors",
                      org.isCurrent && "bg-primary/5 hover:bg-primary/10",
                    )}
                  >
                    {/* Name & Avatar */}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9 border border-border">
                          {org.imageUrl && <AvatarImage src={org.imageUrl} alt={org.name} />}
                          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 font-medium">
                            <span>{org.name}</span>
                            {org.isCurrent && (
                              <Badge variant="outline" className="h-4 border-primary/40 bg-primary/10 text-[10px] text-primary">
                                Current Active
                              </Badge>
                            )}
                          </div>
                          {org.slug && (
                            <span className="text-xs text-muted-foreground">/{org.slug}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Org ID */}
                    <TableCell>
                      <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                        <span>{org.id}</span>
                        <button
                          onClick={() => copyToClipboard(org.id)}
                          className="text-muted-foreground/60 hover:text-foreground"
                          title="Copy Organization ID"
                        >
                          {copiedId === org.id ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      </div>
                    </TableCell>

                    {/* Plan */}
                    <TableCell>
                      {org.plan === "pro" ? (
                        <Badge variant="default" className="gap-1 font-medium capitalize">
                          <Sparkles className="size-3" />
                          Pro Plan
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="font-medium capitalize text-muted-foreground">
                          Free Plan
                        </Badge>
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-block size-2 rounded-full",
                            org.subscriptionStatus === "active"
                              ? "bg-emerald-500"
                              : org.subscriptionStatus === "past_due"
                              ? "bg-amber-500"
                              : "bg-muted-foreground",
                          )}
                        />
                        <span className="text-xs capitalize text-foreground">
                          {org.subscriptionStatus.replace("_", " ")}
                        </span>
                      </div>
                    </TableCell>

                    {/* Seats */}
                    <TableCell>
                      <span className="text-xs font-medium text-foreground">
                        {org.seatsPurchased !== null ? `${org.seatsPurchased} seats` : "Unlimited"}
                      </span>
                    </TableCell>

                    {/* Role */}
                    <TableCell>
                      {org.role ? (
                        <Badge variant="outline" className="capitalize text-xs">
                          {org.role}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {org.isCurrent ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => clerk.openOrganizationProfile()}
                          >
                            <Settings className="size-3.5" />
                            Manage
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={isPending}
                            onClick={() => handleSwitch(org.id)}
                          >
                            Switch to Org
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
