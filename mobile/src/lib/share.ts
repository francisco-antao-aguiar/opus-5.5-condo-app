import { Alert, Platform, Share } from 'react-native';
import { formatInviteCode, type InvitationDto } from '@condo/shared';
import { invitationAccessText } from './format';

type ShareableInvitation = Pick<InvitationDto, 'code' | 'joinUrl' | 'membershipExpiresAt' | 'membershipDurationDays'>;

export function inviteMessage(buildingName: string, invitation: ShareableInvitation): string {
  const access = invitationAccessText(invitation);
  return (
    `Join ${buildingName} on Condo: ${invitation.joinUrl} (code ${formatInviteCode(invitation.code)}` +
    (access ? `, ${access}` : '') +
    ')'
  );
}

function notify(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

/**
 * Opens the OS share sheet (WhatsApp, SMS, mail…). On web without the Web Share API it copies the
 * message to the clipboard instead, or shows it so it can be copied by hand.
 */
export async function shareInvite(buildingName: string, invitation: ShareableInvitation) {
  const message = inviteMessage(buildingName, invitation);
  const nav = typeof navigator !== 'undefined' ? (navigator as Partial<Navigator>) : undefined;
  if (Platform.OS === 'web' && !nav?.share) {
    try {
      await nav!.clipboard!.writeText(message);
      notify('Invite copied', message);
    } catch {
      notify('Share this invite', message);
    }
    return;
  }
  try {
    await Share.share({ message });
  } catch {
    // User cancelled or sharing unavailable: show the text so it can be copied.
    notify('Share this invite', message);
  }
}
