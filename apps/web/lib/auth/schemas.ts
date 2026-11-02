import { z } from 'zod';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt only uses the first 72 bytes

export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address' }));

export const NewPassword = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`);

const passwordsMatch = (v: { password: string; confirmPassword: string }) =>
  v.password === v.confirmPassword;
const mismatch = { message: "Passwords don't match", path: ['confirmPassword'] };

export const SignInInput = z.object({
  email: Email,
  password: z.string().min(1, 'Enter your password'),
});

export const SignUpInput = z
  .object({ email: Email, password: NewPassword, confirmPassword: z.string() })
  .refine(passwordsMatch, mismatch);

export const ForgotPasswordInput = z.object({ email: Email });

export const ResetPasswordInput = z
  .object({ password: NewPassword, confirmPassword: z.string() })
  .refine(passwordsMatch, mismatch);

/** State returned by auth server actions to `useActionState`. */
export interface AuthFormState {
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  message?: string;
  email?: string;
}
