import Link from 'next/link'

/**
 * Where `requireTenant()` sends someone whose membership was removed while they
 * were using the app.
 *
 * The alternative -- letting RLS quietly return zero rows -- renders as an
 * empty dashboard, which reads as "the app lost my data" rather than "your
 * access changed". Naming the state is the whole point of this page.
 */
export default function AccessRevokedPage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold">Your access to this agency ended</h1>
      <p className="text-sm text-muted-foreground">
        An administrator removed you from this agency, so its candidates, clients
        and jobs are no longer available to you.
      </p>
      <p className="text-sm text-muted-foreground">
        If you belong to another agency, switch to it to keep working. If you
        think this is a mistake, contact an administrator there.
      </p>
      <Link
        href="/select-organization"
        className="text-sm font-medium underline underline-offset-4"
      >
        Choose another agency
      </Link>
    </main>
  )
}
