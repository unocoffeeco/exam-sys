"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button. Auto-detected from the text (ลบ / ถาวร / ถอด / รีเซ็ต / ระงับ) when omitted. */
  destructive?: boolean;
};

type ConfirmFn = (options: string | ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

const DANGEROUS = /ลบ|ถาวร|ถอดสิทธิ์|รีเซ็ต|ระงับ|กู้คืนไม่ได้/;

/** Async replacement for the browser confirm dialog: `if (!(await confirm("..."))) return;` */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return fn;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    const opts: ConfirmOptions = typeof options === "string" ? { description: options } : options;
    // a second call while one is open cancels the first
    resolverRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setState(opts);
    });
  }, []);

  function settle(ok: boolean) {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setState(null);
  }

  const destructive = state ? (state.destructive ?? DANGEROUS.test(state.description)) : false;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={state !== null} onOpenChange={(open) => !open && settle(false)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{state?.title ?? (destructive ? "ยืนยันการดำเนินการ (ย้อนกลับไม่ได้)" : "ยืนยันการดำเนินการ")}</DialogTitle>
            <DialogDescription className="whitespace-pre-line">{state?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => settle(false)} autoFocus={destructive}>
              {state?.cancelLabel ?? "ยกเลิก"}
            </Button>
            <Button variant={destructive ? "destructive" : "default"} onClick={() => settle(true)}>
              {state?.confirmLabel ?? "ยืนยัน"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
