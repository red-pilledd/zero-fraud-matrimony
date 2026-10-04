/**
 * DiscoveryScreen — vertical card feed for browsing profiles.
 *
 * Design rules (CLAUDE.md):
 *  - No swiping. Vertical FlatList only.
 *  - Navy / Slate / Gold palette.
 *  - Photos always blurred on discovery cards (chat hasn't started yet).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { API_BASE } from '../services/api';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const NAVY  = '#0A1628';
const SLATE = '#64748B';
const GOLD  = '#C9A84C';
const WHITE = '#F1F5F9';
const GREEN = '#22C55E';

const CARD_BG = '#0D1E35';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoverUser {
  id: number;
  age: number | null;
  height_cm: number | null;
  religion: string | null;
  mother_tongue: string | null;
  nationality: string | null;
  country_of_residence: string | null;
  state: string | null;
  city: string | null;
  education_level: string | null;
  occupation: string | null;
  annual_income: string | null;
  lead_description: string | null;
  profile_confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  primary_photo_url: string | null;
  is_physically_verified: boolean;
}

export interface DiscoveryScreenProps {
  currentUserId: string;
  onStartChat: (partnerId: string) => void;
}

// ---------------------------------------------------------------------------
// ProfileCard sub-component
// ---------------------------------------------------------------------------

const PHOTO_W = 90;
const PHOTO_H = 120;

function ProfileCard({
  user,
  onStartChat,
}: {
  user: DiscoverUser;
  onStartChat: () => void;
}): React.JSX.Element {
  // Build display strings
  const ageLine = [
    user.age ? `${user.age} yrs` : null,
    user.religion,
    user.mother_tongue,
  ]
    .filter(Boolean)
    .join(' · ');

  const locationLine = [user.city, user.country_of_residence]
    .filter(Boolean)
    .join(', ');

  const careerLine = [user.occupation, user.education_level]
    .filter(Boolean)
    .join(' · ');

  const bioSnippet =
    user.lead_description && user.lead_description.length > 0
      ? user.lead_description.slice(0, 140) +
        (user.lead_description.length > 140 ? '…' : '')
      : null;

  return (
    <View style={cardStyles.card}>
      {/* ── Top row: blurred photo + key info ─────────────────────────── */}
      <View style={cardStyles.topRow}>
        {/* Photo — always blurred in discovery */}
        <View style={cardStyles.photoFrame}>
          {user.primary_photo_url ? (
            <>
              <Image
                source={{ uri: user.primary_photo_url }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
              <BlurView
                intensity={88}
                tint="dark"
                style={StyleSheet.absoluteFillObject}
              >
                <View style={cardStyles.lockCenter}>
                  <Text style={cardStyles.lockEmoji}>🔒</Text>
                  <Text style={cardStyles.lockHint}>Chat to unlock</Text>
                </View>
              </BlurView>
            </>
          ) : (
            /* Placeholder avatar when no photo uploaded */
            <View style={cardStyles.photoPlaceholder}>
              <View style={cardStyles.avatarCircle} />
              <View style={cardStyles.avatarBody} />
              <View style={cardStyles.lockCenter}>
                <Text style={cardStyles.lockEmoji}>🔒</Text>
              </View>
            </View>
          )}
        </View>

        {/* Info stack */}
        <View style={cardStyles.infoStack}>
          {/* Member label + verified badge */}
          <View style={cardStyles.memberRow}>
            <Text style={cardStyles.memberLabel}>Member #{user.id}</Text>
            {user.is_physically_verified && (
              <View style={cardStyles.verifiedBadge}>
                <Text style={cardStyles.verifiedText}>✓ Verified</Text>
              </View>
            )}
          </View>

          {ageLine.length > 0 && (
            <Text style={cardStyles.infoLine} numberOfLines={2}>
              {ageLine}
            </Text>
          )}

          {locationLine.length > 0 && (
            <Text style={cardStyles.infoLine} numberOfLines={1}>
              📍 {locationLine}
            </Text>
          )}

          {careerLine.length > 0 && (
            <Text style={cardStyles.infoLine} numberOfLines={2}>
              {careerLine}
            </Text>
          )}

          {user.annual_income && (
            <Text style={[cardStyles.infoLine, cardStyles.incomeText]} numberOfLines={1}>
              {user.annual_income}
            </Text>
          )}

          {/* Profile confidence warning */}
          {user.profile_confidence === 'LOW' && (
            <View style={cardStyles.confidenceBadge}>
              <Text style={cardStyles.confidenceText}>⚠ Unverified details</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── AI bio snippet ─────────────────────────────────────────────── */}
      {bioSnippet && (
        <View style={cardStyles.bioSection}>
          <Text style={cardStyles.bioLabel}>AI Profile</Text>
          <Text style={cardStyles.bioText} numberOfLines={3}>
            {bioSnippet}
          </Text>
        </View>
      )}

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <Pressable
        onPress={onStartChat}
        style={({ pressed }) => [
          cardStyles.ctaButton,
          pressed && cardStyles.ctaButtonPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Start chat with Member ${user.id}`}
      >
        <Text style={cardStyles.ctaText}>Start Chat →</Text>
      </Pressable>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 7,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GOLD + '28',
    padding: 16,
    gap: 14,
  },
  topRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },

  // Photo
  photoFrame: {
    width: PHOTO_W,
    height: PHOTO_H,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1B3A5C',
    flexShrink: 0,
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  avatarCircle: {
    position: 'absolute',
    top: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GOLD + '30',
    borderWidth: 1.5,
    borderColor: GOLD + '60',
  },
  avatarBody: {
    width: '100%',
    height: 52,
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
    backgroundColor: GOLD + '18',
  },
  lockCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  lockEmoji: { fontSize: 20 },
  lockHint: {
    color: WHITE + '80',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  // Info
  infoStack: {
    flex: 1,
    gap: 6,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  memberLabel: {
    color: GOLD,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  verifiedBadge: {
    backgroundColor: GREEN + '18',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: GREEN + '50',
  },
  verifiedText: {
    color: GREEN,
    fontSize: 10,
    fontWeight: '700',
  },
  infoLine: {
    color: WHITE + 'CC',
    fontSize: 12,
    lineHeight: 18,
  },
  incomeText: {
    color: GOLD + 'CC',
  },
  confidenceBadge: {
    backgroundColor: '#EF444415',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#EF444440',
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  confidenceText: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '600',
  },

  // Bio
  bioSection: {
    gap: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SLATE + '30',
  },
  bioLabel: {
    color: SLATE,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  bioText: {
    color: WHITE + 'BB',
    fontSize: 13,
    lineHeight: 20,
  },

  // CTA
  ctaButton: {
    backgroundColor: GOLD,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ctaButtonPressed: { opacity: 0.78 },
  ctaText: {
    color: NAVY,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

// ---------------------------------------------------------------------------
// Main screen component
// ---------------------------------------------------------------------------

export default function DiscoveryScreen({
  currentUserId,
  onStartChat,
}: DiscoveryScreenProps): React.JSX.Element {
  const [users, setUsers]         = useState<DiscoverUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const fetchUsers = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // Strip any "lead-" / "user-" prefix used by the socket layer
      const dbId = currentUserId.replace(/^(lead-|user-)/, '');
      const res = await fetch(
        `${API_BASE}/users/discover?current_user_id=${dbId}&limit=50`,
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Server ${res.status}${body ? ': ' + body : ''}`);
      }
      const data: DiscoverUser[] = await res.json();
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profiles');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ── Loading splash ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GOLD} />
          <Text style={styles.loadingText}>Finding your matches…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discover</Text>
        {users.length > 0 && (
          <Text style={styles.headerCount}>
            {users.length} profile{users.length !== 1 ? 's' : ''}
          </Text>
        )}
      </View>

      {/* Error state */}
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => fetchUsers()}
            style={styles.retryButton}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => (
            <ProfileCard
              user={item}
              onStartChat={() => onStartChat(String(item.id))}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchUsers(true)}
              tintColor={GOLD}
              colors={[GOLD]}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>💫</Text>
              <Text style={styles.emptyTitle}>No profiles yet</Text>
              <Text style={styles.emptyHint}>
                Profiles appear here as members join.{'\n'}Pull to refresh.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Screen-level styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: NAVY,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SLATE + '30',
  },
  headerTitle: {
    color: WHITE,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  headerCount: {
    color: SLATE,
    fontSize: 13,
  },

  // List
  listContent: {
    paddingTop: 8,
    paddingBottom: 90, // extra space so last card clears the tab bar
    flexGrow: 1,
  },

  // States
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  loadingText: {
    color: SLATE,
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
  retryButton: {
    backgroundColor: GOLD,
    paddingHorizontal: 28,
    paddingVertical: 11,
    borderRadius: 12,
  },
  retryText: {
    color: NAVY,
    fontWeight: '700',
    fontSize: 14,
  },
  emptyEmoji: { fontSize: 42 },
  emptyTitle: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyHint: {
    color: SLATE,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 21,
  },
});
