"use client";

import { Plus } from "lucide-react";
import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createCandidateAction,
  type CandidateFormState,
} from "@/lib/actions/candidates";

const INITIAL: CandidateFormState = { status: "idle" };

/**
 * Add-candidate form.
 *
 * Submits straight to the Server Action -- there is no fetch, no API route and
 * no client-held tenant id. The action re-validates everything with the same
 * Zod schema regardless of what this form sends, so the inputs below are a
 * convenience, never the check.
 */
export function NewCandidateDialog({ canWrite }: { canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Closing happens inside the action rather than in an effect keyed on the
  // result: an effect would also fire on an unrelated re-render carrying the
  // same success state, reclosing a dialog the user had just reopened.
  const [state, formAction, pending] = useActionState(
    async (prev: CandidateFormState, formData: FormData) => {
      const result = await createCandidateAction(prev, formData);
      if (result.status === "success") {
        formRef.current?.reset();
        setOpen(false);
      }
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" disabled={!canWrite}>
            <Plus />
            New candidate
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New candidate</DialogTitle>
            <DialogDescription>
              Added to your agency only. Other agencies never see this record.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Field label="Full name" name="fullName" required errors={state.fieldErrors?.fullName} />
            <Field label="Email" name="email" type="email" errors={state.fieldErrors?.email} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Current title" name="currentTitle" />
              <Field label="Current company" name="currentCompany" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Location" name="location" />
              <Field label="Source" name="source" placeholder="referral, linkedin…" />
            </div>
            <Field
              label="Skills"
              name="skills"
              placeholder="react, typescript, node"
              hint="Comma separated."
            />
          </div>

          {state.status === "error" && state.message ? (
            <p className="text-sm text-destructive">{state.message}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add candidate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  hint,
  errors,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  errors?: string[];
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      <Input name={name} type={type} placeholder={placeholder} required={required} />
      {errors?.length ? (
        <span className="text-xs text-destructive">{errors[0]}</span>
      ) : hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}
