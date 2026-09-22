import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import PhotoUploadSection from '../../components/PhotoUploadSection';
import { API_BASE } from '../services/api';
import {
  CASTES_BY_RELIGION,
  COUNTRIES,
  DIET_OPTIONS,
  EDUCATION_LEVELS,
  INCOME_INR,
  INCOME_USD,
  INDIAN_STATES,
  MARITAL_STATUS,
  MOTHER_TONGUES,
  NATIONALITIES,
  OCCUPATIONS,
  RELIGIONS,
} from '../data/profileOptions';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const NAVY  = '#0A1628';
const SLATE = '#64748B';
const GOLD  = '#C9A84C';
const WHITE = '#F1F5F9';
const DARK  = '#152035';

// Hardcoded to match backend config.py — flip both together before launch.
const DEV_MODE = true;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileState {
  age: string;          heightCm: string;
  maritalStatus: string; motherTongue: string;
  prefAgeMin: number;   prefAgeMax: number;
  prefHeightMin: number; prefHeightMax: number;
  prefMaritalStatus: string[]; prefMotherTongue: string[];

  religion: string;  caste: string;  subcaste: string;  gothram: string;
  prefReligion: string[]; prefCaste: string[];

  nationality: string; countryOfResidence: string; state: string; city: string;
  prefNationality: string[]; prefCountry: string[]; prefState: string[];

  educationLevel: string; fieldOfStudy: string;
  occupation: string;     annualIncome: string;
  prefEducationLevel: string; prefOccupation: string[]; prefIncomeRange: string;

  diet: string; drinking: string; smoking: string; hasDisability: string;
  prefDiet: string[];
  prefDrinking: string; prefSmoking: string; prefDisability: string;

  manualBio: string;
  bioDisplayMode: 'ai' | 'manual' | 'both';
}

const INIT: ProfileState = {
  age: '', heightCm: '', maritalStatus: '', motherTongue: '',
  prefAgeMin: 22, prefAgeMax: 35, prefHeightMin: 150, prefHeightMax: 185,
  prefMaritalStatus: [], prefMotherTongue: [],
  religion: '', caste: '', subcaste: '', gothram: '',
  prefReligion: [], prefCaste: [],
  nationality: '', countryOfResidence: '', state: '', city: '',
  prefNationality: [], prefCountry: [], prefState: [],
  educationLevel: '', fieldOfStudy: '', occupation: '', annualIncome: '',
  prefEducationLevel: '', prefOccupation: [], prefIncomeRange: '',
  diet: '', drinking: '', smoking: '', hasDisability: '',
  prefDiet: [], prefDrinking: '', prefSmoking: '', prefDisability: '',
  manualBio: '', bioDisplayMode: 'ai',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// ── DualSlider ──────────────────────────────────────────────────────────────

const THUMB_R = 11;
const THUMB_D = THUMB_R * 2;

function DualSlider({ min, max, low, high, onLow, onHigh }: {
  min: number; max: number; low: number; high: number;
  onLow: (v: number) => void; onHigh: (v: number) => void;
}) {
  const [tw, setTw] = useState(0);
  const twRef = useRef(0);
  const loRef = useRef(low);
  const hiRef = useRef(high);
  const which = useRef<'lo' | 'hi' | null>(null);
  const startPx = useRef(0);

  useEffect(() => { twRef.current = tw; },  [tw]);
  useEffect(() => { loRef.current = low; }, [low]);
  useEffect(() => { hiRef.current = high; }, [high]);

  const toX = (v: number, w: number) =>
    w > THUMB_D ? ((v - min) / (max - min)) * (w - THUMB_D) : 0;

  const toV = (px: number, w: number) =>
    w > THUMB_D
      ? Math.round(Math.max(min, Math.min(max,
          (Math.max(0, Math.min(px, w - THUMB_D)) / (w - THUMB_D)) * (max - min) + min)))
      : min;

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const w  = twRef.current;
      const tx = evt.nativeEvent.locationX;
      const lx = toX(loRef.current, w) + THUMB_R;
      const hx = toX(hiRef.current, w) + THUMB_R;
      which.current   = Math.abs(tx - lx) <= Math.abs(tx - hx) ? 'lo' : 'hi';
      startPx.current = which.current === 'lo'
        ? toX(loRef.current, w) : toX(hiRef.current, w);
    },
    onPanResponderMove: (_, g) => {
      const w  = twRef.current;
      const px = startPx.current + g.dx;
      if (which.current === 'lo') {
        const maxPx = Math.max(0, toX(hiRef.current, w) - THUMB_D);
        const v = toV(Math.max(0, Math.min(px, maxPx)), w);
        loRef.current = v;
        onLow(v);
      } else if (which.current === 'hi') {
        const minPx = toX(loRef.current, w) + THUMB_D;
        const v = toV(Math.max(minPx, Math.min(px, w - THUMB_D)), w);
        hiRef.current = v;
        onHigh(v);
      }
    },
    onPanResponderRelease: () => { which.current = null; },
  })).current;

  const loPx = toX(low, tw);
  const hiPx = toX(high, tw);

  return (
    <View style={{ gap: 4, paddingTop: 2 }}>
      <View
        style={{ height: THUMB_D, position: 'relative' }}
        onLayout={e => setTw(e.nativeEvent.layout.width)}
        {...pan.panHandlers}
      >
        <View style={{
          position: 'absolute', top: THUMB_R - 2,
          left: THUMB_R, right: THUMB_R,
          height: 3, backgroundColor: SLATE + '40', borderRadius: 2,
        }}>
          <View style={{
            position: 'absolute',
            left: loPx, width: Math.max(0, hiPx - loPx),
            height: '100%', backgroundColor: GOLD,
          }} />
        </View>
        {[loPx, hiPx].map((x, i) => (
          <View key={i} pointerEvents="none" style={{
            position: 'absolute', top: 0, left: x,
            width: THUMB_D, height: THUMB_D, borderRadius: THUMB_R,
            backgroundColor: GOLD, borderWidth: 2, borderColor: NAVY,
          }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={s.sliderVal}>{low}</Text>
        <Text style={s.sliderVal}>{high}</Text>
      </View>
    </View>
  );
}

// ── Dropdown ────────────────────────────────────────────────────────────────

function Dropdown({ value, options, placeholder = 'Select…', onChange }: {
  value: string; options: string[];
  placeholder?: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={s.picker} onPress={() => setOpen(true)}>
        <Text style={value ? s.pickerVal : s.pickerPh} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Text style={s.chevron}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setOpen(false)}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <FlatList
              data={options}
              keyExtractor={item => item}
              renderItem={({ item }) => (
                <Pressable
                  style={[s.opt, item === value && s.optActive]}
                  onPress={() => { onChange(item); setOpen(false); }}
                >
                  <Text style={[s.optTxt, item === value && s.optTxtActive]}>{item}</Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ── MultiSelect ──────────────────────────────────────────────────────────────

function MultiSelect({ values, options, placeholder = 'Any', onChange }: {
  values: string[]; options: string[];
  placeholder?: string; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (item: string) => {
    if (item === 'Any') { onChange(['Any']); return; }
    const without = values.filter(v => v !== 'Any');
    onChange(without.includes(item) ? without.filter(v => v !== item) : [...without, item]);
  };
  const label = values.length === 0 ? placeholder
    : values.includes('Any') ? 'Any'
    : values.length === 1 ? values[0]
    : `${values.length} selected`;

  return (
    <>
      <Pressable style={s.picker} onPress={() => setOpen(true)}>
        <Text style={values.length > 0 ? s.pickerVal : s.pickerPh} numberOfLines={1}>
          {label}
        </Text>
        <Text style={s.chevron}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setOpen(false)}>
          <View style={s.sheet}>
            <View style={s.handle} />
            <Pressable style={s.opt} onPress={() => { onChange(['Any']); setOpen(false); }}>
              <Text style={[s.optTxt, values.includes('Any') && s.optTxtActive]}>Any</Text>
              {values.includes('Any') && <Text style={{ color: GOLD }}>✓</Text>}
            </Pressable>
            <View style={s.divider} />
            <FlatList
              data={options}
              keyExtractor={item => item}
              renderItem={({ item }) => {
                const sel = values.includes(item);
                return (
                  <Pressable style={[s.opt, sel && s.optActive]} onPress={() => toggle(item)}>
                    <Text style={[s.optTxt, sel && s.optTxtActive]}>{item}</Text>
                    {sel && <Text style={{ color: GOLD }}>✓</Text>}
                  </Pressable>
                );
              }}
            />
            <Pressable style={s.doneBtn} onPress={() => setOpen(false)}>
              <Text style={s.doneBtnTxt}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// ── AcceptableToggle (Yes / No / Doesn't Matter) ─────────────────────────────

const ACCEPTABLE_OPTS = ['Yes', 'No', "Any"] as const;
type AccVal = typeof ACCEPTABLE_OPTS[number] | '';

function AcceptableToggle({ value, onChange }: { value: AccVal; onChange: (v: AccVal) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
      {ACCEPTABLE_OPTS.map(opt => (
        <Pressable
          key={opt}
          style={[s.pill, value === opt && s.pillActive]}
          onPress={() => onChange(opt)}
        >
          <Text style={[s.pillTxt, value === opt && s.pillTxtActive]}>{opt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── YesNoToggle ───────────────────────────────────────────────────────────────

function YesNoToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {['Yes', 'No'].map(opt => (
        <Pressable key={opt} style={[s.pill, value === opt && s.pillActive]} onPress={() => onChange(opt)}>
          <Text style={[s.pillTxt, value === opt && s.pillTxtActive]}>{opt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.sectionHeader}>
      <View style={s.sectionLine} />
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionLine} />
    </View>
  );
}

function ColHeaders() {
  return (
    <View style={s.row}>
      <Text style={[s.colHdr, { flex: 1 }]}>My Info</Text>
      <Text style={[s.colHdr, { flex: 1 }]}>My Preference</Text>
    </View>
  );
}

function Row({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1 }}>{left}</View>
      <View style={{ flex: 1 }}>{right ?? null}</View>
    </View>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLbl}>{label}</Text>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface ProfileScreenProps {
  userId: number;
  aiBio: string | null;
  onDone: () => void;
}

export default function ProfileScreen({ userId, aiBio, onDone }: ProfileScreenProps) {
  const [form, setForm] = useState<ProfileState>(INIT);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [resolvedUserId, setResolvedUserId] = useState<number>(userId);

  useEffect(() => {
    AsyncStorage.getItem('current_user_id').then(stored => {
      if (stored) setResolvedUserId(parseInt(stored, 10));
    });
  }, []);

  const set = useCallback(<K extends keyof ProfileState>(k: K, v: ProfileState[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  }, []);

  const incomeOptions = form.nationality === 'Indian' ? INCOME_INR : INCOME_USD;
  const casteOptions        = CASTES_BY_RELIGION[form.religion] ?? [];
  const partnerCasteOptions = CASTES_BY_RELIGION[
    form.prefReligion.find(r => r !== 'Any') ?? ''
  ] ?? [];

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const body = {
        age:            form.age      ? parseInt(form.age, 10)      : null,
        height_cm:      form.heightCm ? parseInt(form.heightCm, 10) : null,
        marital_status: form.maritalStatus  || null,
        mother_tongue:  form.motherTongue   || null,
        pref_age_min:   form.prefAgeMin     || null,
        pref_age_max:   form.prefAgeMax     || null,
        pref_height_min: form.prefHeightMin || null,
        pref_height_max: form.prefHeightMax || null,
        pref_marital_status: form.prefMaritalStatus.length ? form.prefMaritalStatus : null,
        pref_mother_tongue:  form.prefMotherTongue.length  ? form.prefMotherTongue  : null,

        religion:     form.religion  || null,
        caste:        form.caste     || null,
        subcaste:     form.subcaste  || null,
        gothram:      form.gothram   || null,
        pref_religion: form.prefReligion.length ? form.prefReligion : null,
        pref_caste:    form.prefCaste.length    ? form.prefCaste    : null,

        nationality:          form.nationality         || null,
        country_of_residence: form.countryOfResidence  || null,
        state:                form.state               || null,
        city:                 form.city                || null,
        pref_nationality:     form.prefNationality.length ? form.prefNationality : null,
        pref_country:         form.prefCountry.length     ? form.prefCountry     : null,
        pref_state:           form.prefState.length       ? form.prefState       : null,

        education_level:      form.educationLevel     || null,
        field_of_study:       form.fieldOfStudy       || null,
        occupation:           form.occupation         || null,
        annual_income:        form.annualIncome        || null,
        pref_education_level: form.prefEducationLevel || null,
        pref_occupation:      form.prefOccupation.length ? form.prefOccupation : null,
        pref_income_range:    form.prefIncomeRange || null,

        diet:            form.diet    || null,
        drinking:        form.drinking || null,
        smoking:         form.smoking  || null,
        has_disability:  form.hasDisability ? form.hasDisability === 'Yes' : null,
        pref_diet:               form.prefDiet.length ? form.prefDiet : null,
        pref_drinking_acceptable: form.prefDrinking  || null,
        pref_smoking_acceptable:  form.prefSmoking   || null,
        pref_disability_acceptable: form.prefDisability || null,

        manual_bio:       form.manualBio || null,
        bio_display_mode: form.bioDisplayMode,
      };
      const res = await fetch(`${API_BASE}/users/${resolvedUserId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.detail
          ? (Array.isArray(err.detail)
              ? err.detail.map((e: { msg: string }) => e.msg).join(', ')
              : err.detail)
          : `Save failed (${res.status})`;
        throw new Error(msg);
      }
      setSaveOk(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* ── Header bar ─────────────────────────────────────────────────── */}
        <View style={s.topBar}>
          <Pressable onPress={onDone} hitSlop={12}>
            <Text style={s.backBtn}>← Back</Text>
          </Pressable>
          <Text style={s.topBarTitle}>Edit Profile</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* ════════════════════════════════════════════════════════════════
              PHOTOS
          ════════════════════════════════════════════════════════════════ */}
          <View style={s.photoSection}>
            <PhotoUploadSection userId={String(resolvedUserId)} />
          </View>

          {/* ════════════════════════════════════════════════════════════════
              SECTION 1 — BASIC INFO
          ════════════════════════════════════════════════════════════════ */}
          <SectionHeader title="Basic Info" />
          <ColHeaders />

          <Row
            left={<Fld label="Age">
              <TextInput
                style={s.input} keyboardType="numeric" maxLength={3}
                value={form.age} onChangeText={v => set('age', v)}
                placeholder="e.g. 28" placeholderTextColor={SLATE}
              />
            </Fld>}
            right={<Fld label="Age Range">
              <DualSlider
                min={18} max={70}
                low={form.prefAgeMin}  high={form.prefAgeMax}
                onLow={v => set('prefAgeMin', v)} onHigh={v => set('prefAgeMax', v)}
              />
            </Fld>}
          />

          <Row
            left={<Fld label="Height (cm)">
              <TextInput
                style={s.input} keyboardType="numeric" maxLength={3}
                value={form.heightCm} onChangeText={v => set('heightCm', v)}
                placeholder="e.g. 170" placeholderTextColor={SLATE}
              />
            </Fld>}
            right={<Fld label="Height Range (cm)">
              <DualSlider
                min={140} max={210}
                low={form.prefHeightMin}  high={form.prefHeightMax}
                onLow={v => set('prefHeightMin', v)} onHigh={v => set('prefHeightMax', v)}
              />
            </Fld>}
          />

          <Row
            left={<Fld label="Marital Status">
              <Dropdown
                value={form.maritalStatus} options={MARITAL_STATUS}
                placeholder="Select…" onChange={v => set('maritalStatus', v)}
              />
            </Fld>}
            right={<Fld label="Acceptable Status">
              <MultiSelect
                values={form.prefMaritalStatus} options={MARITAL_STATUS}
                onChange={v => set('prefMaritalStatus', v)}
              />
            </Fld>}
          />

          <Row
            left={<Fld label="Mother Tongue">
              <Dropdown
                value={form.motherTongue} options={MOTHER_TONGUES}
                placeholder="Select…" onChange={v => set('motherTongue', v)}
              />
            </Fld>}
            right={<Fld label="Partner's Tongue">
              <MultiSelect
                values={form.prefMotherTongue} options={MOTHER_TONGUES}
                onChange={v => set('prefMotherTongue', v)}
              />
            </Fld>}
          />

          {/* ════════════════════════════════════════════════════════════════
              SECTION 2 — RELIGION & COMMUNITY
          ════════════════════════════════════════════════════════════════ */}
          <SectionHeader title="Religion & Community" />
          <ColHeaders />

          <Row
            left={<Fld label="Religion">
              <Dropdown
                value={form.religion} options={RELIGIONS}
                placeholder="Select…"
                onChange={v => { set('religion', v); set('caste', ''); }}
              />
            </Fld>}
            right={<Fld label="Partner's Religion">
              <MultiSelect
                values={form.prefReligion} options={RELIGIONS}
                onChange={v => set('prefReligion', v)}
              />
            </Fld>}
          />

          <Row
            left={<Fld label="Caste">
              <Dropdown
                value={form.caste}
                options={casteOptions.length ? casteOptions : ['Select religion first']}
                placeholder="Select…"
                onChange={v => set('caste', v)}
              />
            </Fld>}
            right={<Fld label="Partner's Caste">
              <MultiSelect
                values={form.prefCaste}
                options={partnerCasteOptions}
                onChange={v => set('prefCaste', v)}
              />
            </Fld>}
          />

          <Row
            left={<Fld label="Subcaste (optional)">
              <TextInput
                style={s.input} value={form.subcaste}
                onChangeText={v => set('subcaste', v)}
                placeholder="Free text" placeholderTextColor={SLATE} maxLength={100}
              />
            </Fld>}
          />

          {form.religion === 'Hindu' && (
            <Row
              left={<Fld label="Gothram (optional)">
                <TextInput
                  style={s.input} value={form.gothram}
                  onChangeText={v => set('gothram', v)}
                  placeholder="e.g. Kashyapa" placeholderTextColor={SLATE} maxLength={100}
                />
              </Fld>}
            />
          )}

          {/* ════════════════════════════════════════════════════════════════
              SECTION 3 — LOCATION
          ════════════════════════════════════════════════════════════════ */}
          <SectionHeader title="Location" />
          <ColHeaders />

          <Row
            left={<Fld label="Nationality">
              <Dropdown
                value={form.nationality} options={NATIONALITIES}
                placeholder="Select…" onChange={v => set('nationality', v)}
              />
            </Fld>}
            right={<Fld label="Partner's Nationality">
              <MultiSelect
                values={form.prefNationality} options={NATIONALITIES}
                onChange={v => set('prefNationality', v)}
              />
            </Fld>}
          />

          <Row
            left={<Fld label="Country of Residence">
              <Dropdown
                value={form.countryOfResidence} options={COUNTRIES}
                placeholder="Select…"
                onChange={v => { set('countryOfResidence', v); set('state', ''); }}
              />
            </Fld>}
            right={<Fld label="Partner's Country">
              <MultiSelect
                values={form.prefCountry} options={COUNTRIES}
                onChange={v => set('prefCountry', v)}
              />
            </Fld>}
          />

          {(form.countryOfResidence === 'India' || form.prefCountry.includes('India')) && (
            <Row
              left={form.countryOfResidence === 'India'
                ? <Fld label="State">
                    <Dropdown
                      value={form.state} options={INDIAN_STATES}
                      placeholder="Select…" onChange={v => set('state', v)}
                    />
                  </Fld>
                : undefined}
              right={form.prefCountry.includes('India')
                ? <Fld label="Partner's State">
                    <MultiSelect
                      values={form.prefState} options={INDIAN_STATES}
                      onChange={v => set('prefState', v)}
                    />
                  </Fld>
                : undefined}
            />
          )}

          <Row
            left={<Fld label="City">
              <TextInput
                style={s.input} value={form.city}
                onChangeText={v => set('city', v)}
                placeholder="e.g. Kochi" placeholderTextColor={SLATE} maxLength={100}
              />
            </Fld>}
          />

          {/* ════════════════════════════════════════════════════════════════
              SECTION 4 — CAREER & EDUCATION
          ════════════════════════════════════════════════════════════════ */}
          <SectionHeader title="Career & Education" />
          <ColHeaders />

          <Row
            left={<Fld label="Education Level">
              <Dropdown
                value={form.educationLevel} options={EDUCATION_LEVELS}
                placeholder="Select…" onChange={v => set('educationLevel', v)}
              />
            </Fld>}
            right={<Fld label="Min. Education Preferred">
              <Dropdown
                value={form.prefEducationLevel} options={EDUCATION_LEVELS}
                placeholder="Select…" onChange={v => set('prefEducationLevel', v)}
              />
            </Fld>}
          />

          <Row
            left={<Fld label="Field of Study">
              <TextInput
                style={s.input} value={form.fieldOfStudy}
                onChangeText={v => set('fieldOfStudy', v)}
                placeholder="e.g. Computer Science" placeholderTextColor={SLATE} maxLength={100}
              />
            </Fld>}
          />

          <Row
            left={<Fld label="Occupation">
              <Dropdown
                value={form.occupation} options={OCCUPATIONS}
                placeholder="Select…" onChange={v => set('occupation', v)}
              />
            </Fld>}
            right={<Fld label="Partner's Occupation">
              <MultiSelect
                values={form.prefOccupation} options={OCCUPATIONS}
                onChange={v => set('prefOccupation', v)}
              />
            </Fld>}
          />

          <Row
            left={<Fld label="Annual Income">
              <Dropdown
                value={form.annualIncome} options={incomeOptions}
                placeholder="Select…" onChange={v => set('annualIncome', v)}
              />
            </Fld>}
            right={<Fld label="Partner's Income">
              <Dropdown
                value={form.prefIncomeRange} options={incomeOptions}
                placeholder="Select…" onChange={v => set('prefIncomeRange', v)}
              />
            </Fld>}
          />

          {/* ════════════════════════════════════════════════════════════════
              SECTION 5 — LIFESTYLE
          ════════════════════════════════════════════════════════════════ */}
          <SectionHeader title="Lifestyle" />
          <ColHeaders />

          <Row
            left={<Fld label="Diet">
              <Dropdown
                value={form.diet} options={DIET_OPTIONS}
                placeholder="Select…" onChange={v => set('diet', v)}
              />
            </Fld>}
            right={<Fld label="Partner's Diet">
              <MultiSelect
                values={form.prefDiet} options={DIET_OPTIONS}
                onChange={v => set('prefDiet', v)}
              />
            </Fld>}
          />

          <Row
            left={<Fld label="Drinking">
              <Dropdown
                value={form.drinking}
                options={['Never', 'Occasionally', 'Regularly']}
                placeholder="Select…" onChange={v => set('drinking', v)}
              />
            </Fld>}
            right={<Fld label="Acceptable?">
              <AcceptableToggle
                value={form.prefDrinking as AccVal}
                onChange={v => set('prefDrinking', v)}
              />
            </Fld>}
          />

          <Row
            left={<Fld label="Smoking">
              <Dropdown
                value={form.smoking}
                options={['Never', 'Occasionally', 'Regularly']}
                placeholder="Select…" onChange={v => set('smoking', v)}
              />
            </Fld>}
            right={<Fld label="Acceptable?">
              <AcceptableToggle
                value={form.prefSmoking as AccVal}
                onChange={v => set('prefSmoking', v)}
              />
            </Fld>}
          />

          <Row
            left={<Fld label="Physical Disability">
              <YesNoToggle value={form.hasDisability} onChange={v => set('hasDisability', v)} />
            </Fld>}
            right={<Fld label="Acceptable?">
              <AcceptableToggle
                value={form.prefDisability as AccVal}
                onChange={v => set('prefDisability', v)}
              />
            </Fld>}
          />

          {/* ════════════════════════════════════════════════════════════════
              SECTION 6 — BIO
          ════════════════════════════════════════════════════════════════ */}
          <SectionHeader title="Bio" />

          {/* Mode toggle */}
          <View style={s.bioToggleRow}>
            {(['ai', 'manual', 'both'] as const).map(mode => (
              <Pressable
                key={mode}
                style={[s.bioToggleBtn, form.bioDisplayMode === mode && s.bioToggleBtnActive]}
                onPress={() => set('bioDisplayMode', mode)}
              >
                <Text style={[s.bioToggleTxt, form.bioDisplayMode === mode && s.bioToggleTxtActive]}>
                  {mode === 'ai' ? 'AI Bio' : mode === 'manual' ? 'Manual Bio' : 'Both'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* AI bio box */}
          {(form.bioDisplayMode === 'ai' || form.bioDisplayMode === 'both') && (
            <View style={s.aiBox}>
              <Text style={s.aiBoxLabel}>AI-Generated Bio</Text>
              <Text style={s.aiBoxText}>
                {aiBio ?? 'Complete your interview to generate an AI bio.'}
              </Text>
              <Pressable
                style={[s.regenBtn, DEV_MODE && s.regenBtnDisabled]}
                disabled={DEV_MODE}
              >
                <Text style={[s.regenBtnTxt, DEV_MODE && s.regenBtnTxtDisabled]}>
                  ↻ Regenerate
                </Text>
              </Pressable>
              {DEV_MODE && (
                <Text style={s.devNote}>Available after launch</Text>
              )}
            </View>
          )}

          {/* Manual bio */}
          {(form.bioDisplayMode === 'manual' || form.bioDisplayMode === 'both') && (
            <View style={{ marginBottom: 16 }}>
              <TextInput
                style={[s.input, s.bioInput]}
                value={form.manualBio}
                onChangeText={v => set('manualBio', v.slice(0, 300))}
                placeholder="Write your own bio (max 300 characters)…"
                placeholderTextColor={SLATE}
                multiline
                maxLength={300}
              />
              <Text style={s.charCount}>{form.manualBio.length} / 300</Text>
            </View>
          )}

          {/* ── Save button ──────────────────────────────────────────────── */}
          {saveError && (
            <View style={s.errorBox}>
              <Text style={s.errorTxt}>{saveError}</Text>
            </View>
          )}
          {saveOk && (
            <View style={s.successBox}>
              <Text style={s.successTxt}>Profile saved successfully.</Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [s.saveBtn, saving && s.saveBtnDisabled, pressed && { opacity: 0.85 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={NAVY} />
              : <Text style={s.saveBtnTxt}>Save Profile</Text>}
          </Pressable>

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: NAVY },
  scroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },

  // Photo section
  photoSection: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SLATE + '30',
    marginBottom: 8,
  },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SLATE + '40',
  },
  topBarTitle: { color: GOLD, fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  backBtn: { color: SLATE, fontSize: 14, fontWeight: '600', width: 60 },

  // Section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 10, gap: 10 },
  sectionLine:   { flex: 1, height: 1, backgroundColor: GOLD + '40' },
  sectionTitle:  { color: GOLD, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  colHdr: { color: SLATE, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },

  // Row / Field
  row:   { flexDirection: 'row', gap: 10, marginBottom: 10 },
  field: { gap: 4, minHeight: 60 },
  fieldLbl: { color: SLATE, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },

  // Inputs
  input: {
    height: 40, borderRadius: 10, borderWidth: 1, borderColor: SLATE + '60',
    backgroundColor: DARK, paddingHorizontal: 10, color: WHITE, fontSize: 13,
  },
  bioInput: { height: 90, textAlignVertical: 'top', paddingTop: 10 },
  charCount: { color: SLATE, fontSize: 11, textAlign: 'right', marginTop: 2 },

  // Slider labels
  sliderVal: { color: GOLD, fontSize: 11, fontWeight: '600' },

  // Dropdown / picker
  picker: {
    height: 40, borderRadius: 10, borderWidth: 1, borderColor: SLATE + '60',
    backgroundColor: DARK, paddingHorizontal: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  pickerVal: { color: WHITE, fontSize: 12, flex: 1 },
  pickerPh:  { color: SLATE, fontSize: 12, flex: 1 },
  chevron:   { color: SLATE, fontSize: 11, marginLeft: 4 },

  // Modal sheet
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: '#1A2A40', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '60%', paddingBottom: 32,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: SLATE + '60',
    alignSelf: 'center', marginTop: 10, marginBottom: 8,
  },
  opt:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 20 },
  optActive: { backgroundColor: GOLD + '15' },
  optTxt:       { color: WHITE, fontSize: 14 },
  optTxtActive: { color: GOLD, fontWeight: '600' },
  divider: { height: 1, backgroundColor: SLATE + '30', marginHorizontal: 16, marginVertical: 4 },
  doneBtn:    { margin: 16, height: 44, borderRadius: 22, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  doneBtnTxt: { color: NAVY, fontWeight: '700', fontSize: 15 },

  // Pills (toggle buttons)
  pill:        { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: SLATE + '60' },
  pillActive:  { borderColor: GOLD, backgroundColor: GOLD + '20' },
  pillTxt:     { color: SLATE, fontSize: 11, fontWeight: '600' },
  pillTxtActive: { color: GOLD },

  // Bio section
  bioToggleRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  bioToggleBtn:       { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: SLATE + '60', alignItems: 'center' },
  bioToggleBtnActive: { borderColor: GOLD, backgroundColor: GOLD + '15' },
  bioToggleTxt:       { color: SLATE, fontSize: 12, fontWeight: '600' },
  bioToggleTxtActive: { color: GOLD },

  aiBox: {
    borderRadius: 14, borderWidth: 1, borderColor: SLATE + '40',
    backgroundColor: SLATE + '18', padding: 14, marginBottom: 14, gap: 8,
  },
  aiBoxLabel: { color: GOLD, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  aiBoxText:  { color: WHITE, fontSize: 13, lineHeight: 21, fontStyle: 'italic' },

  regenBtn:          { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: GOLD },
  regenBtnDisabled:  { borderColor: SLATE + '40' },
  regenBtnTxt:       { color: GOLD, fontSize: 12, fontWeight: '600' },
  regenBtnTxtDisabled: { color: SLATE },
  devNote: { color: SLATE, fontSize: 11, fontStyle: 'italic' },

  // Save
  saveBtn:         { height: 52, borderRadius: 26, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  saveBtnDisabled: { backgroundColor: SLATE + '50' },
  saveBtnTxt:      { color: NAVY, fontSize: 16, fontWeight: '700' },

  errorBox:   { padding: 12, borderRadius: 10, backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF444460', marginBottom: 8 },
  errorTxt:   { color: '#EF4444', fontSize: 13 },
  successBox: { padding: 12, borderRadius: 10, backgroundColor: '#22C55E20', borderWidth: 1, borderColor: '#22C55E60', marginBottom: 8 },
  successTxt: { color: '#22C55E', fontSize: 13 },
});
