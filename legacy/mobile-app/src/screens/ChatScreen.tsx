import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { API_BASE } from '../services/api';
import {
  type AppSocket,
  type ChatLockedPayload,
  type CooldownActivatedPayload,
  type FrostedGlassUnlockedPayload,
  type PaymentVerifiedPayload,
  type ServerMessage,
  type SystemWarningPayload,
  getSocket,
} from '../services/socket';

// ---------------------------------------------------------------------------
// Palette — Data-Driven Elegance (Navy / Slate / Gold)
// ---------------------------------------------------------------------------

const NAVY   = '#0A1628';
const SLATE  = '#64748B';
const GOLD   = '#C9A84C';
const WHITE  = '#F1F5F9';
const DANGER = '#EF4444';
const AMBER  = '#F59E0B';

const GALLERY_SWATCHES = ['#1B3A5C', '#2A4A6E', '#163352', '#223D62'] as const;

const PHOTO_REVEAL_THRESHOLD = 15;
const GALLERY_SIZE = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  id: string;
  fromUserId: string;
  content: string;
  timestamp: number;
  messageCount: number;
}

export type ProfileConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | null;

export interface ChatScreenProps {
  currentUserId: string;
  currentUserStake: number;
  partnerUserId: string;
  partnerConfidence?: ProfileConfidence;
  photoRefreshKey?: number;
  onEditProfile?: () => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PrimaryVibePhoto({ photoUrl, isBlurred }: { photoUrl?: string; isBlurred: boolean }): React.JSX.Element {
  return (
    <View style={photoStyles.container}>
      <View style={photoStyles.frame}>
        {photoUrl ? (
          <>
            <Image
                source={{ uri: photoUrl }}
                style={{ width: 108, height: 148, position: 'absolute', top: 0, left: 0 }}
                resizeMode="cover"
              />
            {isBlurred && (
              <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFillObject}>
                <View style={photoStyles.lockCenter}>
                  <Text style={photoStyles.lockIcon}>🔒</Text>
                </View>
              </BlurView>
            )}
          </>
        ) : (
          <>
            <View style={photoStyles.avatarCircle} />
            <View style={photoStyles.avatarBody} />
          </>
        )}
      </View>
      <View style={photoStyles.badge}>
        <Text style={photoStyles.badgeText}>Primary Vibe</Text>
      </View>
    </View>
  );
}

const photoStyles = StyleSheet.create({
  container: { width: 108, alignItems: 'center', gap: 6 },
  frame: {
    width: 108,
    height: 148,
    borderRadius: 14,
    backgroundColor: NAVY,
    borderWidth: 1,
    borderColor: GOLD + '60',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  avatarCircle: {
    position: 'absolute',
    top: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: GOLD + '40',
    borderWidth: 2,
    borderColor: GOLD + '80',
  },
  avatarBody: {
    width: '100%',
    height: 68,
    borderTopLeftRadius: 54,
    borderTopRightRadius: 54,
    backgroundColor: GOLD + '25',
  },
  lockCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: { fontSize: 26 },
  badge: {
    backgroundColor: GOLD,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    color: NAVY,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});

// ---------------------------------------------------------------------------

interface LockedGalleryProps {
  blurAnims: Animated.Value[];
  isBlurred: boolean;
  photoUrls: string[];
}

function LockedGallery({ blurAnims, isBlurred, photoUrls }: LockedGalleryProps): React.JSX.Element {
  // Show up to 4 slots; pad with nulls if fewer photos
  const slots = Array.from({ length: GALLERY_SIZE }, (_, i) => photoUrls[i] ?? null);

  return (
    <View style={galleryStyles.root}>
      <Text style={galleryStyles.label}>
        {isBlurred ? 'Locked Gallery' : 'Gallery Unlocked'}
      </Text>
      <View style={galleryStyles.grid}>
        {slots.map((url, i) => (
          <View key={i} style={[galleryStyles.thumb, { backgroundColor: GALLERY_SWATCHES[i] }]}>
            {url && (
              <Image
                source={{ uri: url }}
                style={{ width: GALLERY_THUMB_SIZE, height: GALLERY_THUMB_SIZE, position: 'absolute', top: 0, left: 0 }}
                resizeMode="cover"
              />
            )}
            {!url && (
              <>
                <View style={galleryStyles.thumbLine} />
                <View style={[galleryStyles.thumbLine, galleryStyles.thumbLineMid]} />
              </>
            )}
            <Animated.View
              style={[StyleSheet.absoluteFillObject, { opacity: blurAnims[i] }]}
              pointerEvents="none"
            >
              <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFillObject} />
              <View style={galleryStyles.lockOverlay}>
                <Text style={galleryStyles.lockIcon}>🔒</Text>
              </View>
            </Animated.View>
          </View>
        ))}
      </View>
    </View>
  );
}

const GALLERY_THUMB_SIZE = 112;

const galleryStyles = StyleSheet.create({
  root:  { flexShrink: 0, gap: 6 },
  label: {
    color: SLATE,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  thumb: {
    width: GALLERY_THUMB_SIZE,
    height: GALLERY_THUMB_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  thumbLine: {
    position: 'absolute',
    bottom: 22,
    left: 10,
    right: 10,
    height: 3,
    borderRadius: 2,
    backgroundColor: WHITE + '15',
  },
  thumbLineMid: { bottom: 14, right: 28 },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: { fontSize: 22 },
});

// ---------------------------------------------------------------------------
// ProfileConfidenceBadge — reusable, import this into the match feed too
// ---------------------------------------------------------------------------

interface ProfileConfidenceBadgeProps {
  confidence: ProfileConfidence;
}

export function ProfileConfidenceBadge({ confidence }: ProfileConfidenceBadgeProps): React.JSX.Element | null {
  if (!confidence || confidence === 'HIGH') return null;

  const isLow = confidence === 'LOW';
  return (
    <View style={[badgeStyles.root, isLow ? badgeStyles.rootLow : badgeStyles.rootMedium]}>
      <Text style={badgeStyles.icon}>{isLow ? '⚠' : 'ℹ'}</Text>
      <Text style={[badgeStyles.text, isLow ? badgeStyles.textLow : badgeStyles.textMedium]}>
        {isLow
          ? 'Profile may not match stated values'
          : 'Some details unverified'}
      </Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  rootLow: {
    backgroundColor: '#EF444415',
    borderColor: '#EF444450',
  },
  rootMedium: {
    backgroundColor: '#F59E0B15',
    borderColor: '#F59E0B50',
  },
  icon: { fontSize: 12 },
  text: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  textLow:    { color: '#EF4444' },
  textMedium: { color: '#F59E0B' },
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ChatScreen({
  currentUserId,
  currentUserStake,
  partnerUserId,
  partnerConfidence = null,
  photoRefreshKey = 0,
  onEditProfile,
}: ChatScreenProps): React.JSX.Element {
  const [messages, setMessages]         = useState<Message[]>([]);
  const [inputText, setInputText]       = useState('');
  const [messageCount, setCount]        = useState(0);
  const [isBlurred, setIsBlurred]       = useState(true);
  const [isConnected, setConnected]     = useState(false);
  const [systemBlock, setSystemBlock]   = useState(false);
  const [isCooldown, setIsCooldown]     = useState(false);
  const [warning, setWarning]           = useState<string | null>(null);
  const [isProfileExpanded, setProfileExpanded] = useState(false);
  const [partnerPhotos, setPartnerPhotos] = useState<string[]>([]);

  const socketRef = useRef<AppSocket | null>(null);
  const listRef   = useRef<FlatList<Message>>(null);
  const inputRef  = useRef<TextInput>(null);

  const blurAnims = useRef<Animated.Value[]>(
    Array.from({ length: GALLERY_SIZE }, () => new Animated.Value(1)),
  ).current;

  const isInputBlocked = systemBlock || isCooldown;

  // ── Socket lifecycle ────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket(currentUserId, currentUserStake);
    socketRef.current = socket;

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('connect_error', (err: Error) => {
      console.warn('[socket] connect_error:', err.message);
      setConnected(false);
    });

    socket.on('receiveMessage', (msg: ServerMessage) => {
      // Only handle messages from the OTHER user here
      if (msg.fromUserId === currentUserId) return;
      const incomingMsg: Message = {
        id: `${msg.timestamp}-${msg.fromUserId}`,
        fromUserId: msg.fromUserId,
        content: msg.content,
        timestamp: msg.timestamp,
        messageCount: msg.messageCount,
      };
      setMessages(prev => [...prev, incomingMsg]);
      setCount(msg.messageCount);
    });

    // Confirmation from server for our own sent messages — replaces optimistic
    (socket as any).on('messageSent', (msg: ServerMessage) => {
      const confirmedMsg: Message = {
        id: `${msg.timestamp}-${msg.fromUserId}`,
        fromUserId: msg.fromUserId,
        content: msg.content,
        timestamp: msg.timestamp,
        messageCount: msg.messageCount,
      };
      setMessages(prev => {
        const lastOptIdx = prev.reduceRight(
          (found, m, i) => found === -1 && m.id.startsWith('opt-') ? i : found,
          -1,
        );
        if (lastOptIdx === -1) return prev; // already confirmed, ignore
        const next = [...prev];
        next[lastOptIdx] = confirmedMsg;
        return next;
      });
      setCount(msg.messageCount);
    });

    socket.on('frosted_glass_unlocked', (_payload: FrostedGlassUnlockedPayload) => {
      setIsBlurred(false);
      setCount(PHOTO_REVEAL_THRESHOLD); // ensure progress bar shows 5/5 at unlock
      Animated.stagger(
        150,
        blurAnims.map(anim =>
          Animated.timing(anim, {
            toValue: 0,
            duration: 700,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ),
      ).start();
    });

    socket.on('SYSTEM_BLOCK', (_payload: { reason: string }) => {
      setSystemBlock(true);
      setWarning('Safety/Premium violation detected');
    });

    socket.on('cooldown_activated', (_payload: CooldownActivatedPayload) => {
      setIsCooldown(true);
      setWarning('Cooldown active');
    });

    socket.on('payment_verified', (_payload: PaymentVerifiedPayload) => {
      setSystemBlock(false);
      setIsCooldown(false);
      setWarning(null);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('receiveMessage');
      socket.off('frosted_glass_unlocked');
      socket.off('SYSTEM_BLOCK');
      socket.off('cooldown_activated');
      socket.off('payment_verified');
    };
  }, [currentUserId, currentUserStake, blurAnims]);

  // ── Load persisted messages from backend on mount ───────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/messages/${currentUserId}/${partnerUserId}`)
      .then(res => (res.ok ? res.json() : []))
      .then((data: Array<{
        id: number;
        sender_id: string;
        receiver_id: string;
        content: string;
        timestamp: string;
        is_read: boolean;
      }>) => {
        const loaded: Message[] = data.map(m => ({
          id: String(m.id),
          fromUserId: m.sender_id,
          content: m.content,
          timestamp: new Date(m.timestamp).getTime(),
          messageCount: 0,
        }));
        const loadedIds = new Set(loaded.map(m => m.id));
        // Merge with any socket messages that arrived before the fetch returned
        setMessages(prev => [
          ...loaded,
          ...prev.filter(m => !loadedIds.has(m.id)),
        ]);
      })
      .catch(() => { /* silent — start with empty state */ });
  }, [currentUserId, partnerUserId]);

  // ── Fetch persisted relationship state on mount ─────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/relationships/${currentUserId}/${partnerUserId}`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: { message_count: number; photo_unlocked: boolean } | null) => {
        if (!data) return;
        setCount(data.message_count);
        if (data.photo_unlocked) {
          setIsBlurred(false);
          blurAnims.forEach(anim => anim.setValue(0));
        }
      })
      .catch(() => { /* silent — stays blurred until messages are sent */ });
  }, [currentUserId, partnerUserId, blurAnims]);

  // ── Fetch partner photos (re-runs when photoRefreshKey changes) ────────
  useEffect(() => {
    const dbId = partnerUserId.replace(/^(lead-|user-)/, '');
    fetch(`${API_BASE}/photos/${dbId}`)
      .then(res => (res.ok ? res.json() : []))
      .then((data: Array<{ url: string; is_primary: boolean; sort_order: number }>) => {
        const sorted = [...data].sort((a, b) => {
          if (a.is_primary && !b.is_primary) return -1;
          if (!a.is_primary && b.is_primary) return 1;
          return a.sort_order - b.sort_order;
        });
        setPartnerPhotos(sorted.map(p => p.url));
      })
      .catch(() => {});
  }, [partnerUserId, photoRefreshKey]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  // ── Send ────────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !socketRef.current || isInputBlocked) return;

    // Optimistic insert — shows the message immediately before server echo
    const now = Date.now();
    setMessages(prev => [
      ...prev,
      { id: `opt-${now}`, fromUserId: currentUserId, content: text, timestamp: now, messageCount: 0 },
    ]);
    setCount(prev => prev + 1);

    socketRef.current.emit('sendMessage', { toUserId: partnerUserId, content: text });
    setInputText('');
    inputRef.current?.focus();

    // Persist message to database so it survives navigation
    // Chat server persists the message — no need to call POST /messages here

    // Persist message count and drive photo unlock from backend
    fetch(`${API_BASE}/relationships/${currentUserId}/${partnerUserId}/increment`, { method: 'PATCH' })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { message_count: number; photo_unlocked: boolean } | null) => {
        if (!data) return;
        setCount(data.message_count);
        if (data.photo_unlocked) {
          setIsBlurred(false);
          Animated.stagger(
            150,
            blurAnims.map(anim =>
              Animated.timing(anim, { toValue: 0, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
            ),
          ).start();
        }
      })
      .catch(() => { /* silent — optimistic local count still updated above */ });
  }, [inputText, partnerUserId, isInputBlocked, currentUserId, blurAnims]);

  // ── Message renderer ─────────────────────────────────────────────────────

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const isMine = item.fromUserId === currentUserId;
      return (
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubblePartner]}>
          <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextPartner]}>
            {item.content}
          </Text>
        </View>
      );
    },
    [currentUserId],
  );

  const progressPct = Math.min(messageCount / PHOTO_REVEAL_THRESHOLD, 1);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        {/* ── System warning banner ────────────────────────────────────── */}
        {warning !== null && (
          <View style={[
            styles.warningBanner,
            systemBlock ? styles.warningBannerDanger : styles.warningBannerAmber,
          ]}>
            <Text style={[
              styles.warningText,
              systemBlock ? styles.warningTextDanger : styles.warningTextAmber,
            ]}>
              {warning}
            </Text>
            {systemBlock && (
              <Text style={styles.warningSubtext}>
                Unlock chat to continue
              </Text>
            )}
            {isCooldown && !systemBlock && (
              <Text style={styles.warningSubtext}>
                Chat resumes in 5 hours
              </Text>
            )}
          </View>
        )}

        {/* ── Header + collapsible profile panel ─────────────────────────── */}
        <View style={{ flexShrink: 0 }}>
          {/* ── Tappable status bar — tap to expand/collapse profile ─────── */}
          <Pressable
            onPress={() => setProfileExpanded(v => !v)}
            style={styles.statusBar}
          >
            <View style={styles.statusLeft}>
              <View style={[styles.dot, { backgroundColor: isConnected ? '#22C55E' : SLATE }]} />
              <Text style={styles.statusName} numberOfLines={1}>{partnerUserId}</Text>
            </View>
            {onEditProfile && (
              <Pressable
                onPress={onEditProfile}
                hitSlop={10}
                style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: '#C9A84C40' }}
              >
                <Text style={{ color: '#C9A84C', fontSize: 11, fontWeight: '700' }}>Edit Profile</Text>
              </Pressable>
            )}
            <View style={styles.statusRight}>
              <Text style={styles.statusHint}>
                {isBlurred
                  ? `${Math.min(messageCount, PHOTO_REVEAL_THRESHOLD)}/${PHOTO_REVEAL_THRESHOLD} 🔒`
                  : '✨ Unlocked'}
              </Text>
              <Text style={styles.chevron}>{isProfileExpanded ? '▲' : '▼'}</Text>
            </View>
          </Pressable>

          {/* ── Collapsible profile card ──────────────────────────────────── */}
          {isProfileExpanded && (
            <View style={styles.profileCard}>
              <Text style={styles.profileCardTitle}>Match Profile</Text>
              <View style={styles.profileRow}>
                <PrimaryVibePhoto photoUrl={partnerPhotos[0]} isBlurred={isBlurred} />
                <LockedGallery blurAnims={blurAnims} isBlurred={isBlurred} photoUrls={partnerPhotos} />
              </View>
              <ProfileConfidenceBadge confidence={partnerConfidence} />

              {isBlurred ? (
                <View style={styles.progressWrapper}>
                  <View style={styles.progressHeader}>
                    <Text style={styles.progressLabel}>
                      Gallery unlocks after {PHOTO_REVEAL_THRESHOLD} messages
                    </Text>
                    <Text style={styles.progressCount}>
                      {messageCount}/{PHOTO_REVEAL_THRESHOLD}
                    </Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${progressPct * 100}%` as `${number}%` },
                      ]}
                    />
                  </View>
                </View>
              ) : (
                <View style={styles.unlockedBanner}>
                  <Text style={styles.unlockedText}>
                    ✨ Photos revealed — trust established
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Divider ──────────────────────────────────────────────────── */}
          <View style={styles.divider} />
        </View>

        {/* ── Message list (flex: 1 + minHeight guards against crush) ─── */}
        <View style={{ flex: 1, minHeight: 150, paddingHorizontal: 10 }}>
          <FlatList
            ref={listRef}
            style={{ flex: 1 }}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={styles.emptyHint}>Send a message to start the conversation.</Text>
            }
          />
        </View>

        {/* ── Input bar ───────────────────────────────────────────────── */}
        <View style={[styles.inputBar, isInputBlocked && styles.inputBarBlocked]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, isInputBlocked && styles.inputDisabled]}
            value={inputText}
            onChangeText={setInputText}
            blurOnSubmit={false}
            placeholder={
              systemBlock ? 'Chat locked — payment required'  :
              isCooldown  ? 'Cooldown active — chat paused'    :
                            'Type a message…'
            }
            placeholderTextColor={isInputBlocked ? DANGER + '90' : SLATE}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            multiline={false}
            editable={!isInputBlocked}
          />
          <Pressable
            style={({ pressed }) => [
              styles.sendButton,
              pressed && !isInputBlocked && styles.sendButtonPressed,
              isInputBlocked && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={isInputBlocked}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Text style={[styles.sendButtonText, isInputBlocked && styles.sendButtonTextDisabled]}>
              {systemBlock ? 'Locked' : isCooldown ? 'Paused' : 'Send'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Status bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SLATE + '50',
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  dot:        { width: 8, height: 8, borderRadius: 4 },
  statusName: { color: WHITE, fontSize: 16, fontWeight: '600', flex: 1 },
  statusHint: { color: SLATE, fontSize: 12 },
  statusRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chevron: { color: SLATE, fontSize: 10 },

  // Match Profile card
  profileCard: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SLATE + '30',
  },
  profileCardTitle: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  profileRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },

  // Progress
  progressWrapper: { gap: 6 },
  progressHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel:   { color: SLATE, fontSize: 12 },
  progressCount:   { color: GOLD, fontSize: 12, fontWeight: '700' },
  progressTrack:   { height: 4, backgroundColor: SLATE + '35', borderRadius: 2, overflow: 'hidden' },
  progressFill:    { height: '100%', backgroundColor: GOLD, borderRadius: 2 },

  // Unlock banner
  unlockedBanner: {
    backgroundColor: GOLD + '18',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: GOLD + '40',
    alignItems: 'center',
  },
  unlockedText: { color: GOLD, fontSize: 13, fontWeight: '600' },

  // Divider
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: SLATE + '30' },

  // Message list
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, gap: 8, flexGrow: 1 },
  emptyHint:   { color: SLATE, fontSize: 13, textAlign: 'center', marginTop: 32 },

  // Bubbles
  bubble: { maxWidth: '75%', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  bubbleMine:    { alignSelf: 'flex-end', backgroundColor: GOLD, borderBottomRightRadius: 4 },
  bubblePartner: { alignSelf: 'flex-start', backgroundColor: SLATE + '50', borderBottomLeftRadius: 4 },
  bubbleText:        { fontSize: 15, lineHeight: 20 },
  bubbleTextMine:    { color: NAVY, fontWeight: '500' },
  bubbleTextPartner: { color: WHITE },

  // System warning banner
  warningBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  warningBannerDanger: {
    backgroundColor: DANGER + '18',
    borderTopWidth: 1,
    borderTopColor: DANGER + '60',
  },
  warningBannerAmber: {
    backgroundColor: AMBER + '18',
    borderTopWidth: 1,
    borderTopColor: AMBER + '60',
  },
  warningText:       { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  warningTextDanger: { color: DANGER },
  warningTextAmber:  { color: AMBER },
  warningSubtext:    { color: SLATE, fontSize: 11, textAlign: 'center' },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SLATE + '40',
    backgroundColor: NAVY,
  },
  inputBarBlocked: {
    borderTopColor: DANGER + '40',
  },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: SLATE + '80',
    backgroundColor: SLATE + '20',
    color: WHITE,
    fontSize: 15,
  },
  inputDisabled: {
    borderColor: DANGER + '40',
    backgroundColor: DANGER + '08',
  },
  sendButton: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonPressed:      { opacity: 0.75 },
  sendButtonDisabled:     { backgroundColor: SLATE + '40' },
  sendButtonText:         { color: NAVY, fontWeight: '700', fontSize: 15 },
  sendButtonTextDisabled: { color: SLATE },
});
