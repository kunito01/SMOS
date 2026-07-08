import { cn } from "@/lib/utils/cn";

type Avatar = {
  name: string;
  image?: string;
};

type AvatarStackProps = {
  avatars: Avatar[];
  max?: number;
  className?: string;
};

export function AvatarStack({ avatars, max = 4, className }: AvatarStackProps) {
  const visible = avatars.slice(0, max);
  const overflow = avatars.length - visible.length;

  return (
    <div className={cn("flex items-center", className)}>
      {visible.map((avatar, index) => (
        <div
          key={`${avatar.name}-${index}`}
          className="-ml-3 grid size-11 place-items-center overflow-hidden rounded-full border-4 border-white bg-aqua text-sm font-black text-ink first:ml-0"
          title={avatar.name}
        >
          {avatar.image ? (
            <span
              aria-label={avatar.name}
              className="block size-full bg-cover bg-center"
              style={{ backgroundImage: `url(${avatar.image})` }}
            />
          ) : (
            avatar.name.slice(0, 1)
          )}
        </div>
      ))}
      {overflow > 0 ? (
        <div className="-ml-3 grid size-11 place-items-center rounded-full border-4 border-white bg-ink text-xs font-black text-white">
          +{overflow}
        </div>
      ) : null}
    </div>
  );
}
