import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { SPACE_TYPE_LABELS, type CreateSpaceRequest, type SpaceNode, type SpaceType, type UUID, type Visibility } from '@condo/shared';
import { toUpdateRequest, useCreateSpace, useDeleteSpace, useUpdateSpace } from '../../hooks/queries';
import { confirm } from '../../lib/confirm';
import { errorMessage, fieldError } from '../../lib/errors';
import { useTheme } from '../../theme';
import { Button } from '../Button';
import { Chip, ChipGroup, Segmented } from '../Controls';
import { FormError } from '../Layout';
import { Sheet } from '../Sheet';
import { TextField } from '../TextField';

type ChildType = CreateSpaceRequest['type'];
const CHILD_TYPES: ChildType[] = ['FLOOR', 'UNIT', 'ROOM', 'COMMON_AREA'];

const VISIBILITY_OPTIONS: { value: Visibility | null; label: string }[] = [
  { value: null, label: 'Inherit' },
  { value: 'COMMON', label: 'Common' },
  { value: 'PRIVATE', label: 'Private' },
];

/** Most likely child type, so the common case is one tap + a name. */
function suggestedChildType(parent: SpaceType): ChildType {
  switch (parent) {
    case 'BUILDING':
      return 'FLOOR';
    case 'FLOOR':
      return 'UNIT';
    default:
      return 'ROOM';
  }
}

function VisibilityHelp({
  type,
  visibility,
  creating,
}: {
  type: SpaceType;
  visibility: Visibility | null;
  creating?: boolean;
}) {
  const { colors } = useTheme();
  const text =
    visibility === null
      ? creating && type === 'UNIT'
        ? 'New units default to Private when not set.'
        : 'Uses the visibility of the parent space.'
      : visibility === 'COMMON'
        ? 'Visible to every member of the building.'
        : 'Only visible to members of this unit and building managers.';
  return <Text style={{ color: colors.textMuted, fontSize: 13 }}>{text}</Text>;
}

export function AddSpaceSheet({
  visible,
  buildingId,
  parent,
  onClose,
}: {
  visible: boolean;
  buildingId: UUID;
  parent: SpaceNode;
  onClose: () => void;
}) {
  const create = useCreateSpace(buildingId);
  const [type, setType] = useState<ChildType>(suggestedChildType(parent.type));
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Visibility | null>(null);

  useEffect(() => {
    if (visible) {
      setType(suggestedChildType(parent.type));
      setName('');
      setVisibility(null);
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, parent.id]);

  function submit() {
    create.mutate(
      { parentId: parent.id, type, name: name.trim(), visibility },
      { onSuccess: onClose },
    );
  }

  return (
    <Sheet visible={visible} title={'Add to ' + parent.name} onClose={onClose}>
      <FormError message={create.error ? errorMessage(create.error) : null} />
      <ChipGroup>
        {CHILD_TYPES.map((t) => (
          <Chip key={t} label={SPACE_TYPE_LABELS[t]} selected={type === t} onPress={() => setType(t)} />
        ))}
      </ChipGroup>
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder={type === 'FLOOR' ? 'e.g. Floor 5' : type === 'UNIT' ? 'e.g. 5A' : 'e.g. Kitchen'}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => name.trim() && submit()}
        error={fieldError(create.error, 'name')}
      />
      <Segmented accessibilityLabel="Visibility" options={VISIBILITY_OPTIONS} value={visibility} onChange={setVisibility} />
      <VisibilityHelp type={type} visibility={visibility} creating />
      <Button title="Add" onPress={submit} loading={create.isPending} disabled={!name.trim()} />
    </Sheet>
  );
}

export function EditSpaceSheet({
  buildingId,
  node,
  onClose,
}: {
  buildingId: UUID;
  node: SpaceNode | null;
  onClose: () => void;
}) {
  const update = useUpdateSpace(buildingId);
  const remove = useDeleteSpace(buildingId);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<Visibility | null>(null);

  useEffect(() => {
    if (node) {
      update.reset();
      remove.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id]);

  // New node, or a newer version arrived (e.g. after a 409 CONFLICT refetch): show the latest values.
  // The conflict message stays visible because the mutation is not reset here.
  useEffect(() => {
    if (node) {
      setName(node.name);
      setVisibility(node.visibility);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.id, node?.version]);

  if (!node) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;
  const current = node;

  function save() {
    update.mutate(
      { spaceId: current.id, req: toUpdateRequest(current, { name: name.trim(), visibility }) },
      { onSuccess: onClose },
    );
  }

  async function onDelete() {
    const childCount = countDescendants(current);
    const cascade = childCount > 0;
    const ok = await confirm(
      'Delete ' + current.name + '?',
      cascade
        ? 'This also deletes ' + childCount + (childCount === 1 ? ' space' : ' spaces') + ' inside it. This cannot be undone.'
        : 'This cannot be undone.',
      cascade ? 'Delete all' : 'Delete',
    );
    if (!ok) return;
    remove.mutate({ spaceId: current.id, cascade }, { onSuccess: onClose });
  }

  const error = update.error ?? remove.error;
  const dirty = name.trim() !== current.name || visibility !== current.visibility;

  return (
    <Sheet visible title={'Edit ' + current.name} onClose={onClose}>
      <FormError message={error ? errorMessage(error) : null} />
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        returnKeyType="done"
        error={fieldError(update.error, 'name')}
      />
      <Segmented accessibilityLabel="Visibility" options={VISIBILITY_OPTIONS} value={visibility} onChange={setVisibility} />
      <VisibilityHelp type={current.type} visibility={visibility} />
      <Button title="Save" onPress={save} loading={update.isPending} disabled={!name.trim() || !dirty} />
      <Button title="Delete" variant="danger" onPress={onDelete} loading={remove.isPending} />
    </Sheet>
  );
}

function countDescendants(n: SpaceNode): number {
  return n.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);
}
