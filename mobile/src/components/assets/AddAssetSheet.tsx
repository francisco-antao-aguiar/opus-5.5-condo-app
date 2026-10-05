import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, type TextInput } from 'react-native';
import type { AssetTypeDto, SpaceDto, UUID } from '@condo/shared';
import { useCatalog, useCreateAsset } from '../../hooks/queries';
import { errorMessage, fieldError } from '../../lib/errors';
import { useTheme } from '../../theme';
import { Button } from '../Button';
import { FormError } from '../Layout';
import { Sheet } from '../Sheet';
import { TextField } from '../TextField';
import { AssetTypeGrid } from './AssetParts';

/**
 * Quick add: tap "Add asset" → tap a type (name pre-filled, e.g. "Light") → Save. Three taps.
 * The name stays editable; focusing it selects the whole text so typing replaces it.
 */
export function AddAssetSheet({
  visible,
  buildingId,
  space,
  onClose,
}: {
  visible: boolean;
  buildingId: UUID;
  space: SpaceDto;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const catalog = useCatalog(buildingId);
  const create = useCreateAsset(buildingId);
  const [type, setType] = useState<AssetTypeDto | null>(null);
  const [name, setName] = useState('');
  const nameRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setType(null);
      setName('');
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, space.id]);

  function pick(t: AssetTypeDto) {
    // Keep a custom name the user already typed; otherwise follow the type.
    if (!name.trim() || name === type?.name) setName(t.name);
    setType(t);
  }

  function save() {
    if (!type || !name.trim()) return;
    create.mutate({ spaceId: space.id, type: type.code, name: name.trim() }, { onSuccess: onClose });
  }

  return (
    <Sheet visible={visible} title={'Add to ' + space.name} onClose={onClose}>
      <FormError message={create.error ? errorMessage(create.error) : catalog.error ? errorMessage(catalog.error) : null} />
      {catalog.isPending ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <AssetTypeGrid types={catalog.data ?? []} selected={type?.code ?? null} onSelect={pick} />
      )}
      {type ? (
        <>
          <TextField
            ref={nameRef}
            label="Name"
            value={name}
            onChangeText={setName}
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={save}
            maxLength={120}
            error={fieldError(create.error, 'name')}
          />
          <Button title={'Add ' + (name.trim() || type.name)} onPress={save} loading={create.isPending} disabled={!name.trim()} />
        </>
      ) : null}
    </Sheet>
  );
}
