import React, { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import OnboardingScreen from './src/screens/OnboardingScreen';
import InterviewScreen  from './src/screens/InterviewScreen';
import ProfileScreen    from './src/screens/ProfileScreen';
import ChatScreen       from './src/screens/ChatScreen';
import DiscoveryScreen  from './src/screens/DiscoveryScreen';

const NAVY  = '#0A1628';
const SLATE = '#64748B';
const GOLD  = '#C9A84C';

type Screen =
  | { name: 'onboarding' }
  | { name: 'interview'; leadId: number }
  | { name: 'profile';   userId: number; aiBio: string | null }
  | { name: 'main';      userId: string };

type MainTab = 'discover' | 'chat';

const DEV_STAKE = 100;
const DEV_MODE  = false;
const DEV_USERS = [
  { id: '1', partnerID: '2', label: 'User 1 → chatting with User 2' },
  { id: '2', partnerID: '1', label: 'User 2 → chatting with User 1' },
];

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

function TabBar({
  activeTab,
  onTabPress,
}: {
  activeTab: MainTab;
  onTabPress: (t: MainTab) => void;
}): React.JSX.Element {
  return (
    <View style={tabStyles.bar}>
      {(['discover', 'chat'] as MainTab[]).map(tab => (
        <Pressable
          key={tab}
          style={tabStyles.tab}
          onPress={() => onTabPress(tab)}
          accessibilityRole="tab"
        >
          <Text style={tabStyles.icon}>{tab === 'discover' ? '🔍' : '💬'}</Text>
          <Text style={[tabStyles.label, activeTab === tab && tabStyles.labelActive]}>
            {tab === 'discover' ? 'Discover' : 'Chat'}
          </Text>
          {activeTab === tab && <View style={tabStyles.bar2} />}
        </Pressable>
      ))}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 62,
    backgroundColor: '#060F1E',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SLATE + '40',
  },
  tab:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingBottom: 8 },
  icon: { fontSize: 18 },
  label:       { fontSize: 11, fontWeight: '600', color: SLATE, letterSpacing: 0.3 },
  labelActive: { color: GOLD },
  bar2: {
    position: 'absolute', top: 0, left: '25%', right: '25%',
    height: 2, backgroundColor: GOLD,
    borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
  },
});

// ---------------------------------------------------------------------------
// Empty chat state (no partner selected yet)
// ---------------------------------------------------------------------------

function NoChatPartner({ onGoDiscover }: { onGoDiscover: () => void }): React.JSX.Element {
  return (
    <View style={{ flex: 1, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 }}>
      <Text style={{ fontSize: 40 }}>💫</Text>
      <Text style={{ color: '#F1F5F9', fontSize: 17, fontWeight: '700', textAlign: 'center' }}>
        No chat started yet
      </Text>
      <Text style={{ color: SLATE, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
        Browse profiles in Discover, then tap Start Chat to open a conversation.
      </Text>
      <Pressable
        onPress={onGoDiscover}
        style={{ backgroundColor: GOLD, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12, marginTop: 8 }}
      >
        <Text style={{ color: NAVY, fontWeight: '700', fontSize: 14 }}>Go to Discover →</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main tab navigator
// Props are controlled by parent so state survives profile screen navigation.
// ---------------------------------------------------------------------------

function MainTabNavigator({
  userId,
  activeTab,
  chatPartnerId,
  photoRefreshKey,
  onTabPress,
  onStartChat,
  onEditProfile,
}: {
  userId: string;
  activeTab: MainTab;
  chatPartnerId: string;
  photoRefreshKey: number;
  onTabPress: (t: MainTab) => void;
  onStartChat: (partnerId: string) => void;
  onEditProfile: () => void;
}): React.JSX.Element {
  return (
    <View style={{ flex: 1, backgroundColor: NAVY }}>
      <View style={{ flex: 1 }}>
        {activeTab === 'discover' ? (
          <DiscoveryScreen
            currentUserId={userId}
            onStartChat={(partnerId) => {
              onStartChat(partnerId);
              onTabPress('chat');
            }}
          />
        ) : chatPartnerId === '' ? (
          <NoChatPartner onGoDiscover={() => onTabPress('discover')} />
        ) : (
          <ChatScreen
            currentUserId={userId}
            currentUserStake={DEV_STAKE}
            partnerUserId={chatPartnerId}
            photoRefreshKey={photoRefreshKey}
            onEditProfile={onEditProfile}
          />
        )}
      </View>
      <TabBar activeTab={activeTab} onTabPress={onTabPress} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Root — all shared state lives here so it survives screen transitions
// ---------------------------------------------------------------------------

export default function App() {
  const [screen, setScreen]                   = useState<Screen>({ name: 'onboarding' });
  const [photoRefreshKey, setPhotoRefreshKey] = useState(0);
  const [devUser, setDevUser]                 = useState<typeof DEV_USERS[0] | null>(null);

  // Lifted out of MainTabNavigator so they survive profile screen navigation
  const [activeTab, setActiveTab]         = useState<MainTab>('discover');
  const [chatPartnerId, setChatPartnerId] = useState<string>('');

  // ── DEV_MODE picker ───────────────────────────────────────────────────
  if (DEV_MODE) {
    if (!devUser) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <StatusBar style="light" />
          <Text style={{ color: GOLD, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>DEV MODE — Pick a user</Text>
          {DEV_USERS.map(u => (
            <Pressable
              key={u.id}
              onPress={() => { setDevUser(u); setChatPartnerId(u.partnerID); }}
              style={{ backgroundColor: GOLD, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 }}
            >
              <Text style={{ color: NAVY, fontWeight: '700' }}>{u.label}</Text>
            </Pressable>
          ))}
        </SafeAreaView>
      );
    }

    if (screen.name === 'profile') {
      return (
        <>
          <StatusBar style="light" />
          <ProfileScreen
            userId={screen.userId}
            aiBio={screen.aiBio}
            onDone={() => { setPhotoRefreshKey(k => k + 1); setScreen({ name: 'onboarding' }); }}
          />
        </>
      );
    }

    return (
      <>
        <StatusBar style="light" />
        <MainTabNavigator
          userId={devUser.id}
          activeTab={activeTab}
          chatPartnerId={chatPartnerId}
          photoRefreshKey={photoRefreshKey}
          onTabPress={setActiveTab}
          onStartChat={setChatPartnerId}
          onEditProfile={() => setScreen({ name: 'profile', userId: parseInt(devUser.id, 10), aiBio: null })}
        />
      </>
    );
  }

  // ── Onboarding flow ───────────────────────────────────────────────────

  if (screen.name === 'onboarding') {
    return (
      <>
        <StatusBar style="light" />
        <OnboardingScreen onLeadCreated={leadId => setScreen({ name: 'interview', leadId })} />
      </>
    );
  }

  if (screen.name === 'interview') {
    const { leadId } = screen;
    return (
      <>
        <StatusBar style="light" />
        <InterviewScreen
          leadId={leadId}
          onComplete={_aiBio => setScreen({ name: 'main', userId: String(leadId) })}
          onRetake={() => setScreen({ name: 'interview', leadId })}
        />
      </>
    );
  }

  if (screen.name === 'profile') {
    const { userId, aiBio } = screen;
    return (
      <>
        <StatusBar style="light" />
        <ProfileScreen
          userId={userId}
          aiBio={aiBio}
          onDone={() => {
            setPhotoRefreshKey(k => k + 1);
            setScreen({ name: 'main', userId: String(userId) });
          }}
        />
      </>
    );
  }

  // ── Main tabs ─────────────────────────────────────────────────────────

  if (screen.name === 'main') {
    return (
      <>
        <StatusBar style="light" />
        <MainTabNavigator
          userId={screen.userId}
          activeTab={activeTab}
          chatPartnerId={chatPartnerId}
          photoRefreshKey={photoRefreshKey}
          onTabPress={setActiveTab}
          onStartChat={setChatPartnerId}
          onEditProfile={() =>
            setScreen({ name: 'profile', userId: parseInt(screen.userId, 10), aiBio: null })
          }
        />
      </>
    );
  }

  return null;
}
