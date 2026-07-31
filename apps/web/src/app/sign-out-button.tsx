export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/auth/sign-out" method="post">
      <button className={className} type="submit">
        Log out
      </button>
    </form>
  );
}
