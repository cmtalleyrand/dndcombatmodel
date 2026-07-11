import type { ReactNode } from 'react';
import type { ActionKind, Combatant, Scenario, Weapon } from '../engine/types';

interface IconProps {
  size?: number;
  className?: string;
}

/** Shared stroke defaults so every glyph reads as one consistent icon family. */
function Svg({ size = 18, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function SwordIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2v13" />
      <path d="M8 6.5h8" />
      <path d="M12 15v5" />
      <circle cx="12" cy="21.3" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 19 6v5.2c0 4.3-2.9 7.4-7 9.3-4.1-1.9-7-5-7-9.3V6l7-2.5Z" />
    </Svg>
  );
}

export function ShieldHalfIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 19 6v5.2c0 4.3-2.9 7.4-7 9.3-4.1-1.9-7-5-7-9.3V6l7-2.5Z" />
      <path d="M12 3.5v17" fill="none" />
    </Svg>
  );
}

export function BowIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 3c-4 5-4 13 0 18" />
      <path d="M8 3v18" />
      <path d="M8 12h11" />
      <path d="M15 8.5 19 12l-4 3.5" />
    </Svg>
  );
}

export function StaffIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.5l1.6 1.6-1.6 1.6-1.6-1.6L12 2.5Z" />
      <path d="M12 6v15.5" />
      <path d="M8.5 21.5h7" />
    </Svg>
  );
}

export function SkullIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3c-4.1 0-7 3-7 6.8 0 2.3 1.1 3.9 2.5 5v2.7c0 .6.4 1 1 1H10v1.5c0 .5.4 1 1 1h2c.6 0 1-.5 1-1V18.5h1.5c.6 0 1-.4 1-1v-2.7c1.4-1.1 2.5-2.7 2.5-5C19 6 16.1 3 12 3Z" />
      <circle cx="9.3" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20.2s-7.5-4.6-9.6-9C.9 7.9 2.4 4.5 5.7 4c2-.3 3.7.6 6.3 3.1C14.6 4.6 16.3 3.7 18.3 4c3.3.5 4.8 3.9 3.3 7.2-2.1 4.4-9.6 9-9.6 9Z" />
    </Svg>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </Svg>
  );
}

export function FootstepsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="7" cy="7" rx="2.1" ry="3" />
      <ellipse cx="16" cy="13" rx="2.1" ry="3" />
      <path d="M7 11v3M16 17v3" />
    </Svg>
  );
}

export function ScrollIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 4.5h11a2 2 0 0 1 2 2V17a2 2 0 0 0-2-2H6" />
      <path d="M6 4.5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h11" />
      <path d="M9 8.5h6M9 12h6" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V4.8c0-.4.4-.8.8-.8h4.4c.4 0 .8.4.8.8V7" />
      <path d="M6 7l1 13c0 .6.5 1 1 1h8c.5 0 1-.4 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 3.5h11.5L20 7v13.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
      <path d="M8 3.5V9h8V3.5" />
      <path d="M7.5 14h9v6.5h-9z" />
    </Svg>
  );
}

export function LoadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8.5V6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5Z" />
      <path d="M12 11v6M9 14l3 3 3-3" />
    </Svg>
  );
}

export function ResetIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.5h-4.5" />
    </Svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.7" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Decorative role label paired with `pickCombatantIcon` — not mechanically authoritative. */
export type CombatantRole = 'caster' | 'ranged' | 'monster' | 'martial';

function highestAbility(c: Combatant): keyof Combatant['abilityScores'] {
  const entries = Object.entries(c.abilityScores) as [keyof Combatant['abilityScores'], number][];
  return entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
}

/** Derive a decorative icon + role label for a combatant from existing data — no schema changes. */
export function pickCombatantIcon(c: Combatant, scenario: Scenario): { Icon: (p: IconProps) => JSX.Element; role: CombatantRole; label: string } {
  if (c.spellcastingAbility) {
    return { Icon: StaffIcon, role: 'caster', label: 'Spellcaster' };
  }
  if (c.side === 'monster') {
    return { Icon: SkullIcon, role: 'monster', label: 'Monster' };
  }
  const weaponsById = new Map(scenario.weapons.map((w) => [w.id, w] as const));
  const usesRangedWeapon = c.actionIds.some((id) => {
    const action = scenario.actions.find((a) => a.id === id);
    const weapon = action?.weaponId ? weaponsById.get(action.weaponId) : undefined;
    return weapon?.properties.includes('ranged') || weapon?.properties.includes('thrown');
  });
  if (usesRangedWeapon || highestAbility(c) === 'dex') {
    return { Icon: BowIcon, role: 'ranged', label: 'Ranged' };
  }
  return { Icon: SwordIcon, role: 'martial', label: 'Martial' };
}

const ACTION_ICONS: Record<ActionKind, (p: IconProps) => JSX.Element> = {
  attack: SwordIcon,
  spell: StaffIcon,
  ability: BoltIcon,
  dodge: ShieldIcon,
  move: FootstepsIcon,
  dash: FootstepsIcon,
  disengage: FootstepsIcon,
  help: BoltIcon,
  hide: ShieldIcon,
  ready: BoltIcon,
  search: BoltIcon,
};

const ACTION_COLOR_VAR: Record<ActionKind, string> = {
  attack: 'var(--crimson-bright)',
  spell: 'var(--arcane-soft)',
  ability: 'var(--utility-soft)',
  dodge: 'var(--pc-soft)',
  move: 'var(--muted)',
  dash: 'var(--muted)',
  disengage: 'var(--muted)',
  help: 'var(--utility-soft)',
  hide: 'var(--pc-soft)',
  ready: 'var(--utility-soft)',
  search: 'var(--utility-soft)',
};

/** Derive a decorative icon + accent color for an action kind. */
export function pickActionIcon(kind: ActionKind): { Icon: (p: IconProps) => JSX.Element; color: string } {
  return { Icon: ACTION_ICONS[kind], color: ACTION_COLOR_VAR[kind] };
}

/** Derive a decorative icon for a weapon based on its properties. */
export function pickWeaponIcon(weapon: Weapon): (p: IconProps) => JSX.Element {
  return weapon.properties.includes('ranged') || weapon.properties.includes('thrown') ? BowIcon : SwordIcon;
}
