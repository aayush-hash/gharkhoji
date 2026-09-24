"""Well-known Kathmandu Valley areas and landmarks people search by.

Coordinates are approximate centre points, good enough for "rooms near X" searches.
Check them on a map and add more before launch; later this can move to a database table
that admins edit.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Place:
    slug: str
    name: str
    name_ne: str
    kind: str  # "area" or "landmark"
    lat: float
    lng: float


PLACES: list[Place] = [
    # Areas
    Place("new-baneshwor", "New Baneshwor", "नयाँ बानेश्वर", "area", 27.6915, 85.3420),
    Place("shantinagar", "Shantinagar", "शान्तिनगर", "area", 27.6880, 85.3390),
    Place("koteshwor", "Koteshwor", "कोटेश्वर", "area", 27.6789, 85.3494),
    Place("tinkune", "Tinkune", "तिनकुने", "area", 27.6858, 85.3470),
    Place("sinamangal", "Sinamangal", "सिनामंगल", "area", 27.6970, 85.3560),
    Place("maitighar", "Maitighar", "माइतीघर", "area", 27.6947, 85.3206),
    Place("putalisadak", "Putalisadak", "पुतलीसडक", "area", 27.7040, 85.3220),
    Place("dillibazar", "Dillibazar", "डिल्लीबजार", "area", 27.7050, 85.3280),
    Place("thamel", "Thamel", "ठमेल", "area", 27.7152, 85.3123),
    Place("lazimpat", "Lazimpat", "लाजिम्पाट", "area", 27.7222, 85.3200),
    Place("baluwatar", "Baluwatar", "बालुवाटार", "area", 27.7290, 85.3290),
    Place("maharajgunj", "Maharajgunj", "महाराजगंज", "area", 27.7369, 85.3300),
    Place("samakhusi", "Samakhusi", "सामाखुसी", "area", 27.7340, 85.3180),
    Place("gongabu", "Gongabu", "गोंगबु", "area", 27.7350, 85.3140),
    Place("chabahil", "Chabahil", "चाबहिल", "area", 27.7174, 85.3465),
    Place("boudha", "Boudha", "बौद्ध", "area", 27.7215, 85.3620),
    Place("kalanki", "Kalanki", "कलंकी", "area", 27.6935, 85.2810),
    Place("balkhu", "Balkhu", "बल्खु", "area", 27.6850, 85.2980),
    Place("kirtipur", "Kirtipur", "कीर्तिपुर", "area", 27.6780, 85.2780),
    Place("patan", "Patan", "पाटन", "area", 27.6727, 85.3253),
    Place("pulchowk", "Pulchowk", "पुल्चोक", "area", 27.6780, 85.3170),
    Place("jawalakhel", "Jawalakhel", "जावलाखेल", "area", 27.6725, 85.3130),
    Place("lagankhel", "Lagankhel", "लगनखेल", "area", 27.6660, 85.3230),
    Place("bhaktapur", "Bhaktapur", "भक्तपुर", "area", 27.6720, 85.4280),
    # Landmarks
    Place("baneshwor-chowk", "Baneshwor Chowk", "बानेश्वर चोक", "landmark", 27.6890, 85.3355),
    Place("koteshwor-chowk", "Koteshwor Chowk", "कोटेश्वर चोक", "landmark", 27.6780, 85.3490),
    Place("tu-kirtipur", "Tribhuvan University (TU)", "त्रिभुवन विश्वविद्यालय", "landmark", 27.6827, 85.2880),
    Place("civil-hospital", "Civil Hospital", "सिभिल अस्पताल", "landmark", 27.6865, 85.3385),
    Place("bhatbhateni", "Bhatbhateni", "भाटभटेनी", "landmark", 27.7200, 85.3320),
    Place("ratnapark", "Ratnapark", "रत्नपार्क", "landmark", 27.7060, 85.3150),
    Place("new-bus-park", "New Bus Park", "नयाँ बसपार्क", "landmark", 27.7350, 85.3100),
    Place("airport", "Tribhuvan International Airport", "त्रिभुवन विमानस्थल", "landmark", 27.6966, 85.3591),
]

_BY_SLUG = {p.slug: p for p in PLACES}


def find_place(slug: str) -> Place | None:
    return _BY_SLUG.get(slug.lower())


def search_places(query: str | None) -> list[Place]:
    if not query:
        return PLACES
    q = query.strip().lower()
    return [p for p in PLACES if q in p.name.lower() or q in p.name_ne or q in p.slug]
