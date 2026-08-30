"use client";

import { useState, type RefObject } from "react";

// D-079 (P2-5): every form in the app called `formRef.current.reportValidity()`
// before submitting to keep native required/min/max/type checks working
// without a full custom-validation rewrite (see person-forms.tsx's own
// comment on why reportValidity() was chosen originally). reportValidity()
// does that check, but it *also* pops the browser's own native validation
// tooltip -- unstyled, inconsistent across browsers, and easy to lose
// against a dark theme. checkValidity() runs the exact same pass/fail
// check silently, with no tooltip; pair it with `noValidate` on the
// <form> (which only suppresses the browser's own submit-time UI, not
// the underlying constraint validation) and this hook's `invalid` flag
// to show one styled inline message instead. Single shared implementation
// so every form gets the same behavior instead of patching each one.
export function useFormValidity(formRef: RefObject<HTMLFormElement | null>) {
  const [invalid, setInvalid] = useState(false);

  function checkValid(): boolean {
    const form = formRef.current;
    if (!form) return false;
    const ok = form.checkValidity();
    setInvalid(!ok);
    return ok;
  }

  function clearInvalid() {
    if (invalid) setInvalid(false);
  }

  return { invalid, checkValid, clearInvalid };
}
