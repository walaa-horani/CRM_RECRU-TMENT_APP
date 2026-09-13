import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "crm_recruitment"

// Inline so the card renders identically with no network. Real usage passes a
// candidate photo URL to AvatarImage.
const PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
       <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0%" stop-color="#c2673a"/><stop offset="100%" stop-color="#8a3d16"/>
       </linearGradient></defs>
       <rect width="96" height="96" fill="url(#g)"/>
       <circle cx="48" cy="38" r="16" fill="#fff" opacity="0.9"/>
       <path d="M16 96c4-20 17-30 32-30s28 10 32 30z" fill="#fff" opacity="0.9"/>
     </svg>`,
  )

export const Sizes = () => (
  <div className="flex items-center gap-3">
    <Avatar size="sm">
      <AvatarFallback>AK</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>DM</AvatarFallback>
    </Avatar>
    <Avatar size="lg">
      <AvatarFallback>HR</AvatarFallback>
    </Avatar>
  </div>
)

export const WithImage = () => (
  <div className="flex items-center gap-3">
    <Avatar size="lg">
      <AvatarImage src={PHOTO} alt="Ayesha Khan" />
      <AvatarFallback>AK</AvatarFallback>
    </Avatar>
    <div className="flex flex-col">
      <span className="font-medium">Ayesha Khan</span>
      <span className="text-sm text-muted-foreground">
        Senior Frontend Engineer
      </span>
    </div>
  </div>
)

export const Group = () => (
  <AvatarGroup>
    <Avatar>
      <AvatarFallback>AK</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>DM</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>HR</AvatarFallback>
    </Avatar>
    <AvatarGroupCount>+4</AvatarGroupCount>
  </AvatarGroup>
)

export const WithStatus = () => (
  <div className="flex items-center gap-3">
    <Avatar size="lg">
      <AvatarFallback>AK</AvatarFallback>
      <AvatarBadge className="bg-primary" />
    </Avatar>
    <Avatar size="lg">
      <AvatarFallback>BA</AvatarFallback>
      <AvatarBadge className="bg-muted-foreground" />
    </Avatar>
  </div>
)
