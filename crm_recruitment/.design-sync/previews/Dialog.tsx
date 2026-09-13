import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
} from "crm_recruitment"

// `open` is set so the panel renders statically in the card. In an app you
// leave it uncontrolled and let DialogTrigger open it.
export const RejectConfirmation = () => (
  <Dialog open>
    <DialogTrigger render={<Button variant="destructive">Reject candidate</Button>} />
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Reject Ayesha Khan?</DialogTitle>
        <DialogDescription>
          This moves the candidate out of the active pipeline. They will not be
          notified automatically.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose render={<Button variant="outline">Cancel</Button>} />
        <Button variant="destructive">Reject</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)

export const ScheduleInterview = () => (
  <Dialog open>
    <DialogTrigger render={<Button>Schedule interview</Button>} />
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Schedule interview</DialogTitle>
        <DialogDescription>
          Send an invitation for the technical round.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="dlg-when" className="text-sm font-medium">
            Date and time
          </label>
          <Input id="dlg-when" defaultValue="12 Mar 2026, 14:00" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="dlg-panel" className="text-sm font-medium">
            Panel
          </label>
          <Input id="dlg-panel" placeholder="Add interviewers" />
        </div>
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline">Cancel</Button>} />
        <Button>Send invite</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
