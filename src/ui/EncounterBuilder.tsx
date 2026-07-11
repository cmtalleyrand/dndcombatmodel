import { genId } from '../state/store';
import { NumberInput } from './NumberInput';
import { TrashIcon } from './icons';

/**
 * Structured-but-flexible encounter description. Instead of making the user delete
 * bracketed placeholder text out of a textarea, they fill in as many (or as few)
 * rows/fields as they like; {@link buildEncounterDescription} compiles whatever is
 * filled into a clean prompt for the model. Every field is optional.
 */
export interface BuilderPC {
  id: string;
  className: string;
  level: string;
  abilities: string;
  hp: string;
  ac: string;
  notes: string;
}

export interface BuilderMonster {
  id: string;
  name: string;
  count: string;
  cr: string;
  abilities: string;
  hp: string;
  ac: string;
  notes: string;
}

export interface EncounterForm {
  pcs: BuilderPC[];
  monsters: BuilderMonster[];
  distance: string;
  positioning: string;
  tactics: string;
  goal: string;
}

export function emptyPC(): BuilderPC {
  return { id: genId('bpc'), className: '', level: '', abilities: '', hp: '', ac: '', notes: '' };
}

export function emptyMonster(): BuilderMonster {
  return { id: genId('bmon'), name: '', count: '', cr: '', abilities: '', hp: '', ac: '', notes: '' };
}

export function emptyEncounterForm(): EncounterForm {
  return { pcs: [emptyPC()], monsters: [emptyMonster()], distance: '', positioning: '', tactics: '', goal: '' };
}

function pcHasContent(pc: BuilderPC): boolean {
  return Boolean(pc.className || pc.level || pc.abilities || pc.hp || pc.ac || pc.notes);
}
function monsterHasContent(m: BuilderMonster): boolean {
  return Boolean(m.name || m.count || m.cr || m.abilities || m.hp || m.ac || m.notes);
}

/** True once the user has entered enough to bother asking the model. */
export function encounterFormHasContent(form: EncounterForm): boolean {
  return (
    form.pcs.some(pcHasContent) ||
    form.monsters.some(monsterHasContent) ||
    Boolean(form.distance || form.positioning || form.tactics || form.goal)
  );
}

/** Compile the filled-in fields into a structured natural-language encounter request. */
export function buildEncounterDescription(form: EncounterForm): string {
  const blocks: string[] = [];

  const pcLines = form.pcs.filter(pcHasContent).map((pc) => {
    const head = [pc.className || 'PC', pc.level ? `level ${pc.level}` : ''].filter(Boolean).join(', ');
    const bits = [
      pc.abilities ? `key abilities ${pc.abilities}` : '',
      pc.hp ? `${pc.hp} HP` : '',
      pc.ac ? `AC ${pc.ac}` : '',
      pc.notes ? `spells/features: ${pc.notes}` : '',
    ].filter(Boolean);
    return `- ${head}${bits.length ? `. ${bits.join('; ')}` : ''}`;
  });
  if (pcLines.length) blocks.push(`Party (Player Characters):\n${pcLines.join('\n')}`);

  const monsterLines = form.monsters.filter(monsterHasContent).map((m) => {
    const head = [m.name || 'Monster', m.count && Number(m.count) > 1 ? `×${m.count}` : '', m.cr ? `CR ${m.cr}` : '']
      .filter(Boolean)
      .join(' ');
    const bits = [
      m.abilities ? `key abilities ${m.abilities}` : '',
      m.hp ? `${m.hp} HP` : '',
      m.ac ? `AC ${m.ac}` : '',
      m.notes ? `abilities: ${m.notes}` : '',
    ].filter(Boolean);
    return `- ${head}${bits.length ? `. ${bits.join('; ')}` : ''}`;
  });
  if (monsterLines.length) blocks.push(`Enemies (Monsters):\n${monsterLines.join('\n')}`);

  const battlefield = [
    form.distance ? `Sides start ${form.distance} ft apart.` : '',
    form.positioning ? `Positions/terrain: ${form.positioning}.` : '',
  ].filter(Boolean);
  if (battlefield.length) blocks.push(`Battlefield: ${battlefield.join(' ')}`);

  if (form.tactics) blocks.push(`Tactics & priorities:\n${form.tactics}`);
  if (form.goal) blocks.push(`What this simulation should answer: ${form.goal}`);

  return blocks.join('\n\n');
}

type Props = {
  form: EncounterForm;
  setForm: (form: EncounterForm) => void;
  disabled?: boolean;
};

export function EncounterBuilder({ form, setForm, disabled }: Props) {
  const patch = (p: Partial<EncounterForm>) => setForm({ ...form, ...p });

  const updatePC = (id: string, p: Partial<BuilderPC>) =>
    patch({ pcs: form.pcs.map((pc) => (pc.id === id ? { ...pc, ...p } : pc)) });
  const updateMonster = (id: string, p: Partial<BuilderMonster>) =>
    patch({ monsters: form.monsters.map((m) => (m.id === id ? { ...m, ...p } : m)) });

  return (
    <div className="builder">
      <div className="builder-group">
        <div className="builder-group-head">
          <span className="builder-group-title pc">Party — Player Characters</span>
          <button type="button" className="ghost mini" disabled={disabled} onClick={() => patch({ pcs: [...form.pcs, emptyPC()] })}>
            + Add PC
          </button>
        </div>
        {form.pcs.map((pc, i) => (
          <div className="builder-row pc" key={pc.id}>
            <div className="builder-row-index">{i + 1}</div>
            <div className="builder-fields">
              <label className="grow">
                Class
                <input value={pc.className} disabled={disabled} placeholder="e.g. Wizard" onChange={(e) => updatePC(pc.id, { className: e.target.value })} />
              </label>
              <label className="tiny">
                Level
                <input value={pc.level} disabled={disabled} placeholder="5" onChange={(e) => updatePC(pc.id, { level: e.target.value })} />
              </label>
              <label className="grow">
                Key abilities
                <input value={pc.abilities} disabled={disabled} placeholder="INT 18, DEX 14" onChange={(e) => updatePC(pc.id, { abilities: e.target.value })} />
              </label>
              <label className="tiny">
                HP
                <input value={pc.hp} disabled={disabled} placeholder="27" onChange={(e) => updatePC(pc.id, { hp: e.target.value })} />
              </label>
              <label className="tiny">
                AC
                <input value={pc.ac} disabled={disabled} placeholder="12" onChange={(e) => updatePC(pc.id, { ac: e.target.value })} />
              </label>
              <label className="wide">
                Signature spells, gear & features
                <input value={pc.notes} disabled={disabled} placeholder="Fireball, Firebolt, Shield, Sculpt Spells" onChange={(e) => updatePC(pc.id, { notes: e.target.value })} />
              </label>
            </div>
            <button
              type="button"
              className="ghost icon-only builder-remove"
              disabled={disabled || form.pcs.length === 1}
              title="Remove this PC"
              aria-label="Remove this PC"
              onClick={() => patch({ pcs: form.pcs.filter((p) => p.id !== pc.id) })}
            >
              <TrashIcon size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="builder-group">
        <div className="builder-group-head">
          <span className="builder-group-title monster">Enemies — Monsters</span>
          <button type="button" className="ghost mini" disabled={disabled} onClick={() => patch({ monsters: [...form.monsters, emptyMonster()] })}>
            + Add monster
          </button>
        </div>
        {form.monsters.map((m, i) => (
          <div className="builder-row monster" key={m.id}>
            <div className="builder-row-index">{i + 1}</div>
            <div className="builder-fields">
              <label className="grow">
                Type / name
                <input value={m.name} disabled={disabled} placeholder="e.g. Ogre" onChange={(e) => updateMonster(m.id, { name: e.target.value })} />
              </label>
              <label className="tiny">
                Count
                <input value={m.count} disabled={disabled} placeholder="2" onChange={(e) => updateMonster(m.id, { count: e.target.value })} />
              </label>
              <label className="tiny">
                CR
                <input value={m.cr} disabled={disabled} placeholder="2" onChange={(e) => updateMonster(m.id, { cr: e.target.value })} />
              </label>
              <label className="grow">
                Key abilities
                <input value={m.abilities} disabled={disabled} placeholder="STR 19, CON 16" onChange={(e) => updateMonster(m.id, { abilities: e.target.value })} />
              </label>
              <label className="tiny">
                HP
                <input value={m.hp} disabled={disabled} placeholder="59" onChange={(e) => updateMonster(m.id, { hp: e.target.value })} />
              </label>
              <label className="tiny">
                AC
                <input value={m.ac} disabled={disabled} placeholder="11" onChange={(e) => updateMonster(m.id, { ac: e.target.value })} />
              </label>
              <label className="wide">
                Attacks & notable abilities
                <input value={m.notes} disabled={disabled} placeholder="Greatclub +6 (2d8+4), Multiattack" onChange={(e) => updateMonster(m.id, { notes: e.target.value })} />
              </label>
            </div>
            <button
              type="button"
              className="ghost icon-only builder-remove"
              disabled={disabled || form.monsters.length === 1}
              title="Remove this monster"
              aria-label="Remove this monster"
              onClick={() => patch({ monsters: form.monsters.filter((x) => x.id !== m.id) })}
            >
              <TrashIcon size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="builder-group">
        <div className="builder-group-head">
          <span className="builder-group-title">Battlefield & tactics</span>
        </div>
        <div className="builder-fields">
          <label className="small">
            Starting distance (ft)
            <NumberInput
              className="num"
              min={0}
              step={5}
              value={form.distance === '' ? 0 : Number(form.distance)}
              onChange={(n) => patch({ distance: String(n) })}
            />
          </label>
          <label className="wide">
            Positions / terrain
            <input value={form.positioning} disabled={disabled} placeholder="PCs clustered together, ogres advancing from cover" onChange={(e) => patch({ positioning: e.target.value })} />
          </label>
        </div>
        <label style={{ width: '100%', marginTop: '0.5rem' }}>
          Tactics & priorities
          <textarea
            value={form.tactics}
            disabled={disabled}
            placeholder="Who focuses which target; when to spend limited resources; retreat/protect/heal behavior. e.g. Wizard opens with Fireball, Cleric heals allies below 50% HP, Fighter guards the Cleric."
            onChange={(e) => patch({ tactics: e.target.value })}
            style={{ minHeight: '4.5rem' }}
          />
        </label>
        <label style={{ width: '100%', marginTop: '0.5rem' }}>
          What should this simulation answer?
          <input value={form.goal} disabled={disabled} placeholder="Party win rate and average rounds to victory" onChange={(e) => patch({ goal: e.target.value })} />
        </label>
      </div>
    </div>
  );
}
