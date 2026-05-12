import { StatusBar } from 'expo-status-bar';
import ChatScreen from './src/screens/ChatScreen';

// ---------------------------------------------------------------------------
// Dev placeholders — replace with real auth context / navigation stack.
// These values must match a user in the backend (stake_balance >= 1 to pass
// the Socket.io Stake System middleware).
// ---------------------------------------------------------------------------
const DEV_USER_ID    = 'user-alice';
const DEV_STAKE      = 100;
const DEV_PARTNER_ID = 'user-bob';

export default function App() {
  return (
    <>
      <StatusBar style="light" />
      <ChatScreen
        currentUserId={DEV_USER_ID}
        currentUserStake={DEV_STAKE}
        partnerUserId={DEV_PARTNER_ID}
      />
    </>
  );
}
