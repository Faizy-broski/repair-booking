'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

// ── Country data ───────────────────────────────────────────────────────────────

export interface Country {
  name: string
  iso2: string
  dialCode: string
}

export const COUNTRIES: Country[] = [
  { name: 'United Kingdom', iso2: 'GB', dialCode: '44' },
  { name: 'United States', iso2: 'US', dialCode: '1' },
  { name: 'Afghanistan', iso2: 'AF', dialCode: '93' },
  { name: 'Albania', iso2: 'AL', dialCode: '355' },
  { name: 'Algeria', iso2: 'DZ', dialCode: '213' },
  { name: 'American Samoa', iso2: 'AS', dialCode: '1684' },
  { name: 'Andorra', iso2: 'AD', dialCode: '376' },
  { name: 'Angola', iso2: 'AO', dialCode: '244' },
  { name: 'Anguilla', iso2: 'AI', dialCode: '1264' },
  { name: 'Antigua and Barbuda', iso2: 'AG', dialCode: '1268' },
  { name: 'Argentina', iso2: 'AR', dialCode: '54' },
  { name: 'Armenia', iso2: 'AM', dialCode: '374' },
  { name: 'Aruba', iso2: 'AW', dialCode: '297' },
  { name: 'Australia', iso2: 'AU', dialCode: '61' },
  { name: 'Austria', iso2: 'AT', dialCode: '43' },
  { name: 'Azerbaijan', iso2: 'AZ', dialCode: '994' },
  { name: 'Bahamas', iso2: 'BS', dialCode: '1242' },
  { name: 'Bahrain', iso2: 'BH', dialCode: '973' },
  { name: 'Bangladesh', iso2: 'BD', dialCode: '880' },
  { name: 'Barbados', iso2: 'BB', dialCode: '1246' },
  { name: 'Belarus', iso2: 'BY', dialCode: '375' },
  { name: 'Belgium', iso2: 'BE', dialCode: '32' },
  { name: 'Belize', iso2: 'BZ', dialCode: '501' },
  { name: 'Benin', iso2: 'BJ', dialCode: '229' },
  { name: 'Bermuda', iso2: 'BM', dialCode: '1441' },
  { name: 'Bhutan', iso2: 'BT', dialCode: '975' },
  { name: 'Bolivia', iso2: 'BO', dialCode: '591' },
  { name: 'Bosnia and Herzegovina', iso2: 'BA', dialCode: '387' },
  { name: 'Botswana', iso2: 'BW', dialCode: '267' },
  { name: 'Brazil', iso2: 'BR', dialCode: '55' },
  { name: 'British Virgin Islands', iso2: 'VG', dialCode: '1284' },
  { name: 'Brunei', iso2: 'BN', dialCode: '673' },
  { name: 'Bulgaria', iso2: 'BG', dialCode: '359' },
  { name: 'Burkina Faso', iso2: 'BF', dialCode: '226' },
  { name: 'Burundi', iso2: 'BI', dialCode: '257' },
  { name: 'Cambodia', iso2: 'KH', dialCode: '855' },
  { name: 'Cameroon', iso2: 'CM', dialCode: '237' },
  { name: 'Canada', iso2: 'CA', dialCode: '1' },
  { name: 'Cape Verde', iso2: 'CV', dialCode: '238' },
  { name: 'Cayman Islands', iso2: 'KY', dialCode: '1345' },
  { name: 'Central African Republic', iso2: 'CF', dialCode: '236' },
  { name: 'Chad', iso2: 'TD', dialCode: '235' },
  { name: 'Chile', iso2: 'CL', dialCode: '56' },
  { name: 'China', iso2: 'CN', dialCode: '86' },
  { name: 'Colombia', iso2: 'CO', dialCode: '57' },
  { name: 'Comoros', iso2: 'KM', dialCode: '269' },
  { name: 'Congo', iso2: 'CG', dialCode: '242' },
  { name: 'Cook Islands', iso2: 'CK', dialCode: '682' },
  { name: 'Costa Rica', iso2: 'CR', dialCode: '506' },
  { name: "Côte d'Ivoire", iso2: 'CI', dialCode: '225' },
  { name: 'Croatia', iso2: 'HR', dialCode: '385' },
  { name: 'Cuba', iso2: 'CU', dialCode: '53' },
  { name: 'Cyprus', iso2: 'CY', dialCode: '357' },
  { name: 'Czech Republic', iso2: 'CZ', dialCode: '420' },
  { name: 'Denmark', iso2: 'DK', dialCode: '45' },
  { name: 'Djibouti', iso2: 'DJ', dialCode: '253' },
  { name: 'Dominica', iso2: 'DM', dialCode: '1767' },
  { name: 'Dominican Republic', iso2: 'DO', dialCode: '1809' },
  { name: 'Ecuador', iso2: 'EC', dialCode: '593' },
  { name: 'Egypt', iso2: 'EG', dialCode: '20' },
  { name: 'El Salvador', iso2: 'SV', dialCode: '503' },
  { name: 'Equatorial Guinea', iso2: 'GQ', dialCode: '240' },
  { name: 'Eritrea', iso2: 'ER', dialCode: '291' },
  { name: 'Estonia', iso2: 'EE', dialCode: '372' },
  { name: 'Ethiopia', iso2: 'ET', dialCode: '251' },
  { name: 'Falkland Islands', iso2: 'FK', dialCode: '500' },
  { name: 'Faroe Islands', iso2: 'FO', dialCode: '298' },
  { name: 'Fiji', iso2: 'FJ', dialCode: '679' },
  { name: 'Finland', iso2: 'FI', dialCode: '358' },
  { name: 'France', iso2: 'FR', dialCode: '33' },
  { name: 'French Guiana', iso2: 'GF', dialCode: '594' },
  { name: 'French Polynesia', iso2: 'PF', dialCode: '689' },
  { name: 'Gabon', iso2: 'GA', dialCode: '241' },
  { name: 'Gambia', iso2: 'GM', dialCode: '220' },
  { name: 'Georgia', iso2: 'GE', dialCode: '995' },
  { name: 'Germany', iso2: 'DE', dialCode: '49' },
  { name: 'Ghana', iso2: 'GH', dialCode: '233' },
  { name: 'Gibraltar', iso2: 'GI', dialCode: '350' },
  { name: 'Greece', iso2: 'GR', dialCode: '30' },
  { name: 'Greenland', iso2: 'GL', dialCode: '299' },
  { name: 'Grenada', iso2: 'GD', dialCode: '1473' },
  { name: 'Guadeloupe', iso2: 'GP', dialCode: '590' },
  { name: 'Guam', iso2: 'GU', dialCode: '1671' },
  { name: 'Guatemala', iso2: 'GT', dialCode: '502' },
  { name: 'Guinea', iso2: 'GN', dialCode: '224' },
  { name: 'Guinea-Bissau', iso2: 'GW', dialCode: '245' },
  { name: 'Guyana', iso2: 'GY', dialCode: '592' },
  { name: 'Haiti', iso2: 'HT', dialCode: '509' },
  { name: 'Honduras', iso2: 'HN', dialCode: '504' },
  { name: 'Hong Kong', iso2: 'HK', dialCode: '852' },
  { name: 'Hungary', iso2: 'HU', dialCode: '36' },
  { name: 'Iceland', iso2: 'IS', dialCode: '354' },
  { name: 'India', iso2: 'IN', dialCode: '91' },
  { name: 'Indonesia', iso2: 'ID', dialCode: '62' },
  { name: 'Iran', iso2: 'IR', dialCode: '98' },
  { name: 'Iraq', iso2: 'IQ', dialCode: '964' },
  { name: 'Ireland', iso2: 'IE', dialCode: '353' },
  { name: 'Israel', iso2: 'IL', dialCode: '972' },
  { name: 'Italy', iso2: 'IT', dialCode: '39' },
  { name: 'Jamaica', iso2: 'JM', dialCode: '1876' },
  { name: 'Japan', iso2: 'JP', dialCode: '81' },
  { name: 'Jordan', iso2: 'JO', dialCode: '962' },
  { name: 'Kazakhstan', iso2: 'KZ', dialCode: '7' },
  { name: 'Kenya', iso2: 'KE', dialCode: '254' },
  { name: 'Kiribati', iso2: 'KI', dialCode: '686' },
  { name: 'Kuwait', iso2: 'KW', dialCode: '965' },
  { name: 'Kyrgyzstan', iso2: 'KG', dialCode: '996' },
  { name: 'Laos', iso2: 'LA', dialCode: '856' },
  { name: 'Latvia', iso2: 'LV', dialCode: '371' },
  { name: 'Lebanon', iso2: 'LB', dialCode: '961' },
  { name: 'Lesotho', iso2: 'LS', dialCode: '266' },
  { name: 'Liberia', iso2: 'LR', dialCode: '231' },
  { name: 'Libya', iso2: 'LY', dialCode: '218' },
  { name: 'Liechtenstein', iso2: 'LI', dialCode: '423' },
  { name: 'Lithuania', iso2: 'LT', dialCode: '370' },
  { name: 'Luxembourg', iso2: 'LU', dialCode: '352' },
  { name: 'Macao', iso2: 'MO', dialCode: '853' },
  { name: 'Madagascar', iso2: 'MG', dialCode: '261' },
  { name: 'Malawi', iso2: 'MW', dialCode: '265' },
  { name: 'Malaysia', iso2: 'MY', dialCode: '60' },
  { name: 'Maldives', iso2: 'MV', dialCode: '960' },
  { name: 'Mali', iso2: 'ML', dialCode: '223' },
  { name: 'Malta', iso2: 'MT', dialCode: '356' },
  { name: 'Marshall Islands', iso2: 'MH', dialCode: '692' },
  { name: 'Martinique', iso2: 'MQ', dialCode: '596' },
  { name: 'Mauritania', iso2: 'MR', dialCode: '222' },
  { name: 'Mauritius', iso2: 'MU', dialCode: '230' },
  { name: 'Mexico', iso2: 'MX', dialCode: '52' },
  { name: 'Micronesia', iso2: 'FM', dialCode: '691' },
  { name: 'Moldova', iso2: 'MD', dialCode: '373' },
  { name: 'Monaco', iso2: 'MC', dialCode: '377' },
  { name: 'Mongolia', iso2: 'MN', dialCode: '976' },
  { name: 'Montenegro', iso2: 'ME', dialCode: '382' },
  { name: 'Montserrat', iso2: 'MS', dialCode: '1664' },
  { name: 'Morocco', iso2: 'MA', dialCode: '212' },
  { name: 'Mozambique', iso2: 'MZ', dialCode: '258' },
  { name: 'Myanmar', iso2: 'MM', dialCode: '95' },
  { name: 'Namibia', iso2: 'NA', dialCode: '264' },
  { name: 'Nauru', iso2: 'NR', dialCode: '674' },
  { name: 'Nepal', iso2: 'NP', dialCode: '977' },
  { name: 'Netherlands', iso2: 'NL', dialCode: '31' },
  { name: 'New Caledonia', iso2: 'NC', dialCode: '687' },
  { name: 'New Zealand', iso2: 'NZ', dialCode: '64' },
  { name: 'Nicaragua', iso2: 'NI', dialCode: '505' },
  { name: 'Niger', iso2: 'NE', dialCode: '227' },
  { name: 'Nigeria', iso2: 'NG', dialCode: '234' },
  { name: 'Niue', iso2: 'NU', dialCode: '683' },
  { name: 'Norway', iso2: 'NO', dialCode: '47' },
  { name: 'Oman', iso2: 'OM', dialCode: '968' },
  { name: 'Pakistan', iso2: 'PK', dialCode: '92' },
  { name: 'Palau', iso2: 'PW', dialCode: '680' },
  { name: 'Panama', iso2: 'PA', dialCode: '507' },
  { name: 'Papua New Guinea', iso2: 'PG', dialCode: '675' },
  { name: 'Paraguay', iso2: 'PY', dialCode: '595' },
  { name: 'Peru', iso2: 'PE', dialCode: '51' },
  { name: 'Philippines', iso2: 'PH', dialCode: '63' },
  { name: 'Poland', iso2: 'PL', dialCode: '48' },
  { name: 'Portugal', iso2: 'PT', dialCode: '351' },
  { name: 'Puerto Rico', iso2: 'PR', dialCode: '1787' },
  { name: 'Qatar', iso2: 'QA', dialCode: '974' },
  { name: 'Romania', iso2: 'RO', dialCode: '40' },
  { name: 'Russia', iso2: 'RU', dialCode: '7' },
  { name: 'Rwanda', iso2: 'RW', dialCode: '250' },
  { name: 'Saint Kitts and Nevis', iso2: 'KN', dialCode: '1869' },
  { name: 'Saint Lucia', iso2: 'LC', dialCode: '1758' },
  { name: 'Saint Vincent and the Grenadines', iso2: 'VC', dialCode: '1784' },
  { name: 'Samoa', iso2: 'WS', dialCode: '685' },
  { name: 'San Marino', iso2: 'SM', dialCode: '378' },
  { name: 'Sao Tome and Principe', iso2: 'ST', dialCode: '239' },
  { name: 'Saudi Arabia', iso2: 'SA', dialCode: '966' },
  { name: 'Senegal', iso2: 'SN', dialCode: '221' },
  { name: 'Serbia', iso2: 'RS', dialCode: '381' },
  { name: 'Seychelles', iso2: 'SC', dialCode: '248' },
  { name: 'Sierra Leone', iso2: 'SL', dialCode: '232' },
  { name: 'Singapore', iso2: 'SG', dialCode: '65' },
  { name: 'Slovakia', iso2: 'SK', dialCode: '421' },
  { name: 'Slovenia', iso2: 'SI', dialCode: '386' },
  { name: 'Solomon Islands', iso2: 'SB', dialCode: '677' },
  { name: 'Somalia', iso2: 'SO', dialCode: '252' },
  { name: 'South Africa', iso2: 'ZA', dialCode: '27' },
  { name: 'South Sudan', iso2: 'SS', dialCode: '211' },
  { name: 'Spain', iso2: 'ES', dialCode: '34' },
  { name: 'Sri Lanka', iso2: 'LK', dialCode: '94' },
  { name: 'Sudan', iso2: 'SD', dialCode: '249' },
  { name: 'Suriname', iso2: 'SR', dialCode: '597' },
  { name: 'Eswatini', iso2: 'SZ', dialCode: '268' },
  { name: 'Sweden', iso2: 'SE', dialCode: '46' },
  { name: 'Switzerland', iso2: 'CH', dialCode: '41' },
  { name: 'Syria', iso2: 'SY', dialCode: '963' },
  { name: 'Taiwan', iso2: 'TW', dialCode: '886' },
  { name: 'Tajikistan', iso2: 'TJ', dialCode: '992' },
  { name: 'Tanzania', iso2: 'TZ', dialCode: '255' },
  { name: 'Thailand', iso2: 'TH', dialCode: '66' },
  { name: 'Timor-Leste', iso2: 'TL', dialCode: '670' },
  { name: 'Togo', iso2: 'TG', dialCode: '228' },
  { name: 'Tonga', iso2: 'TO', dialCode: '676' },
  { name: 'Trinidad and Tobago', iso2: 'TT', dialCode: '1868' },
  { name: 'Tunisia', iso2: 'TN', dialCode: '216' },
  { name: 'Turkey', iso2: 'TR', dialCode: '90' },
  { name: 'Turkmenistan', iso2: 'TM', dialCode: '993' },
  { name: 'Turks and Caicos Islands', iso2: 'TC', dialCode: '1649' },
  { name: 'Tuvalu', iso2: 'TV', dialCode: '688' },
  { name: 'Uganda', iso2: 'UG', dialCode: '256' },
  { name: 'Ukraine', iso2: 'UA', dialCode: '380' },
  { name: 'United Arab Emirates', iso2: 'AE', dialCode: '971' },
  { name: 'Uruguay', iso2: 'UY', dialCode: '598' },
  { name: 'Uzbekistan', iso2: 'UZ', dialCode: '998' },
  { name: 'Vanuatu', iso2: 'VU', dialCode: '678' },
  { name: 'Venezuela', iso2: 'VE', dialCode: '58' },
  { name: 'Vietnam', iso2: 'VN', dialCode: '84' },
  { name: 'Wallis and Futuna', iso2: 'WF', dialCode: '681' },
  { name: 'Yemen', iso2: 'YE', dialCode: '967' },
  { name: 'Zambia', iso2: 'ZM', dialCode: '260' },
  { name: 'Zimbabwe', iso2: 'ZW', dialCode: '263' },
]

function flagEmoji(iso2: string): string {
  return iso2.toUpperCase().split('').map(c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  ).join('')
}

// ── Component ──────────────────────────────────────────────────────────────────

interface PhoneInputProps {
  value?: string
  onChange?: (value: string) => void
  error?: string
  label?: string
  placeholder?: string
  defaultCountry?: string
}

export function PhoneInput({
  value = '',
  onChange,
  error,
  label = 'Phone number',
  placeholder = '7700 900000',
  defaultCountry = 'GB',
}: PhoneInputProps) {
  const defaultC = COUNTRIES.find(c => c.iso2 === defaultCountry) ?? COUNTRIES[0]
  const [selected, setSelected] = useState<Country>(defaultC)
  const [number, setNumber] = useState('')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Parse incoming value if it starts with +
  useEffect(() => {
    if (!value) return
    const match = COUNTRIES.find(c => value.startsWith(`+${c.dialCode}`))
    if (match) {
      setSelected(match)
      setNumber(value.slice(match.dialCode.length + 1))
    } else {
      setNumber(value)
    }
  }, []) // only on mount

  const emit = useCallback((country: Country, num: string) => {
    const full = num ? `+${country.dialCode}${num.replace(/\s/g, '')}` : ''
    onChange?.(full)
  }, [onChange])

  function selectCountry(c: Country) {
    setSelected(c)
    setOpen(false)
    setSearch('')
    emit(c, number)
  }

  function handleNumber(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/[^\d\s\-()]/g, '')
    setNumber(val)
    emit(selected, val)
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Focus search on open
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50)
  }, [open])

  const filtered = search
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.dialCode.includes(search.replace('+', ''))
      )
    : COUNTRIES

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-on-surface">{label}</label>
      )}

      <div className="flex gap-0">
        {/* Country selector */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className={`flex items-center gap-1.5 rounded-l-xl border-y border-l px-3 py-2.5 text-sm font-medium bg-surface-container hover:bg-surface-container-high transition-colors h-[42px] ${
              error ? 'border-error' : 'border-outline-variant'
            }`}
          >
            <span className="text-base leading-none">{flagEmoji(selected.iso2)}</span>
            <span className="text-on-surface">+{selected.dialCode}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-on-surface-variant transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="absolute left-0 bottom-full z-50 mb-1 w-72 rounded-xl border border-outline-variant bg-surface shadow-xl overflow-hidden">
              {/* Search */}
              <div className="flex items-center gap-2 border-b border-outline-variant px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-on-surface-variant" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search country or code…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')}>
                    <X className="h-3.5 w-3.5 text-on-surface-variant" />
                  </button>
                )}
              </div>

              {/* List */}
              <ul className="max-h-56 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-on-surface-variant">No results</li>
                ) : (
                  filtered.map(c => (
                    <li key={`${c.iso2}-${c.dialCode}`}>
                      <button
                        type="button"
                        onClick={() => selectCountry(c)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-container transition-colors ${
                          selected.iso2 === c.iso2 && selected.dialCode === c.dialCode
                            ? 'bg-primary-container/40 text-primary font-medium'
                            : 'text-on-surface'
                        }`}
                      >
                        <span className="text-base w-6 text-center leading-none">{flagEmoji(c.iso2)}</span>
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="shrink-0 text-on-surface-variant text-xs">+{c.dialCode}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Number input */}
        <input
          type="tel"
          value={number}
          onChange={handleNumber}
          placeholder={placeholder}
          className={`flex-1 rounded-r-xl border-y border-r px-3 py-2.5 text-sm text-on-surface bg-surface outline-none placeholder:text-on-surface-variant focus:ring-2 focus:ring-primary/30 transition h-[42px] ${
            error ? 'border-error focus:ring-error/20' : 'border-outline-variant focus:border-primary'
          }`}
        />
      </div>

      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}
