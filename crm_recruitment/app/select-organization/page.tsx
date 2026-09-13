import { OrganizationList } from '@clerk/nextjs'

/**
 * Where `requireTenant()` sends a signed-in user with no active organization.
 *
 * Reachable two ways: they have never joined an agency, or the one they were
 * using was taken away and Clerk cleared the active org on the next token
 * refresh. Clerk's own component handles switching and creating, and it
 * re-renders on its own once the session updates -- so a user removed in
 * another tab lands here without a manual reload.
 */
export default function SelectOrganizationPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Choose an agency</h1>
        <p className="text-sm text-muted-foreground">
          Your work is scoped to one agency at a time.
        </p>
      </div>
      <OrganizationList
        hidePersonal
        afterSelectOrganizationUrl="/crm"
        afterCreateOrganizationUrl="/crm"
      />
    </main>
  )
}
