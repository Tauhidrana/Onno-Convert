import Image from "next/image";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`block h-10 w-[168px] shrink-0 ${className}`}>
      <Image
        src="/logo-light.svg"
        alt="Onno Convert by OnnoPoth"
        width={168}
        height={40}
        className="h-10 w-[168px] dark:hidden"
        unoptimized
      />
      <Image
        src="/logo-dark.svg"
        alt="Onno Convert by OnnoPoth"
        width={168}
        height={40}
        className="hidden h-10 w-[168px] dark:block"
        unoptimized
      />
    </span>
  );
}
