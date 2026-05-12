import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';

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

const PHOTO_REVEAL_THRESHOLD = 5;
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

export interface ChatScreenProps {
  currentUserId: string;
  currentUserStake: number;
  partnerUserId: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PrimaryVibePhoto(): React.JSX.Element {
  return (
    <View style={photoStyles.container}>
      <View style={photoStyles.frame}>
        <View style={photoStyles.avatarCircle} />
        <View style={photoStyles.avatarBody} />
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
}

function LockedGallery({ blurAnims, isBlurred }: LockedGalleryProps): React.JSX.Element {
  return (
    <View style={galleryStyles.root}>
      <Text style={galleryStyles.label}>
        {isBlurred ? 'Locked Gallery' : 'Gallery Unlocked'}
      </Text>
      <View style={galleryStyles.grid}>
        {GALLERY_SWATCHES.map((swatch, i) => (
          <View key={i} style={[galleryStyles.thumb, { backgroundColor: swatch }]}>
            <View style={galleryStyles.thumbLine} />
            <View style={[galleryStyles.thumbLine, galleryStyles.thumbLineMid]} />
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

const galleryStyles = StyleSheet.create({
  root:  { flex: 1, gap: 6 },
  label: {
    color: SLATE,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  thumb: {
    flexBasis: '47%',
    aspectRatio: 1,
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
// Main component
// ---------------------------------------------------------------------------

export default function ChatScreen({
  currentUserId,
  currentUserStake,
  partnerUserId,
}: ChatScreenProps): React.JSX.Element {
  const [messages, setMessages]         = useState<Message[]>([]);
  const [inputText, setInputText]       = useState('');
  const [messageCount, setCount]        = useState(0);
  const [isBlurred, setIsBlurred]       = useState(true);
  const [isConnected, setConnected]     = useState(false);
  const [isChatLocked, setIsChatLocked] = useState(false);
  const [isCooldown, setIsCooldown]     = useState(false);
  const [warning, setWarning]           = useState<string | null>(null);

  const socketRef = useRef<AppSocket | null>(null);
  const listRef   = useRef<FlatList<Message>>(null);

  const blurAnims = useRef<Animated.Value[]>(
    Array.from({ length: GALLERY_SIZE }, () => new Animated.Value(1)),
  ).current;

  const isInputBlocked = isChatLocked || isCooldown;

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
      setMessages(prev => [
        ...prev,
        {
          id: `${msg.timestamp}-${msg.fromUserId}`,
          fromUserId: msg.fromUserId,
          content: msg.content,
          timestamp: msg.timestamp,
          messageCount: msg.messageCount,
        },
      ]);
      setCount(msg.messageCount);
    });

    socket.on('frosted_glass_unlocked', (_payload: FrostedGlassUnlockedPayload) => {
      setIsBlurred(false);
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

    socket.on('system_warning', (payload: SystemWarningPayload) => {
      setWarning(payload.message);
    });

    socket.on('chat_locked', (_payload: ChatLockedPayload) => {
      setIsChatLocked(true);
      setWarning('Safety/Premium violation detected');
    });

    socket.on('cooldown_activated', (_payload: CooldownActivatedPayload) => {
      setIsCooldown(true);
      setWarning('Cooldown active');
    });

    socket.on('payment_verified', (_payload: PaymentVerifiedPayload) => {
      setIsChatLocked(false);
      setIsCooldown(false);
      setWarning(null);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('receiveMessage');
      socket.off('frosted_glass_unlocked');
      socket.off('system_warning');
      socket.off('chat_locked');
      socket.off('cooldown_activated');
      socket.off('payment_verified');
    };
  }, [currentUserId, currentUserStake, blurAnims]);

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
    socketRef.current.emit('sendMessage', { toUserId: partnerUserId, content: text });
    setInputText('');
  }, [inputText, partnerUserId, isInputBlocked]);

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
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* ── Status bar ─────────────────────────────────────────────────── */}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <View style={[styles.dot, { backgroundColor: isConnected ? '#22C55E' : SLATE }]} />
          <Text style={styles.statusName} numberOfLines={1}>{partnerUserId}</Text>
        </View>
        <Text style={styles.statusHint}>
          {isBlurred ? 'Gallery locked' : 'Gallery unlocked ✨'}
        </Text>
      </View>

      {/* ── Match Profile header ────────────────────────────────────────── */}
      <View style={styles.profileCard}>
        <Text style={styles.profileCardTitle}>Match Profile</Text>
        <View style={styles.profileRow}>
          <PrimaryVibePhoto />
          <LockedGallery blurAnims={blurAnims} isBlurred={isBlurred} />
        </View>

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

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <View style={styles.divider} />

      {/* ── Message list ────────────────────────────────────────────────── */}
      <FlatList
        ref={listRef}
        style={styles.list}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyHint}>Send a message to start the conversation.</Text>
        }
      />

      {/* ── System warning banner ────────────────────────────────────────── */}
      {warning !== null && (
        <View style={[
          styles.warningBanner,
          isChatLocked ? styles.warningBannerDanger : styles.warningBannerAmber,
        ]}>
          <Text style={[
            styles.warningText,
            isChatLocked ? styles.warningTextDanger : styles.warningTextAmber,
          ]}>
            {warning}
          </Text>
          {isChatLocked && (
            <Text style={styles.warningSubtext}>
              Unlock chat to continue
            </Text>
          )}
          {isCooldown && !isChatLocked && (
            <Text style={styles.warningSubtext}>
              Chat resumes in 5 hours
            </Text>
          )}
        </View>
      )}

      {/* ── Input bar ───────────────────────────────────────────────────── */}
      <View style={[styles.inputBar, isInputBlocked && styles.inputBarBlocked]}>
        <TextInput
          style={[styles.input, isInputBlocked && styles.inputDisabled]}
          value={inputText}
          onChangeText={setInputText}
          placeholder={
            isChatLocked  ? 'Chat locked — payment required'  :
            isCooldown    ? 'Cooldown active — chat paused'    :
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
            {isChatLocked ? 'Locked' : isCooldown ? 'Paused' : 'Send'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },

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
  listContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexGrow: 1 },
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
    paddingBottom: 28,
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
