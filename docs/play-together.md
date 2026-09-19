# Play Together prototype

## Scope

Three small games for caregiver-accompanied toddler play, with three rounds
each. Existing letter, number, shape, and size matching remains available.
All content is authored and deterministic. No child data is collected or saved.

| Game | Practice opportunity | Interaction |
| --- | --- | --- |
| Picnic | One-to-one placement and spoken quantities 1-3 | Move each apple onto a plate; hear counting only when sound is enabled. |
| Hide and seek | Inside, under, beside | Place Teddy in a pictured environment with three possible locations. |
| Pack a bag | Familiar object words | Choose the requested object from two pictures and put it in a backpack. |

Picnic provides exactly the requested quantity. It is guided practice, not a
test that the child can independently select a quantity from a larger set.
Packing and hiding include distractors, but a correct drop alone does not
establish vocabulary comprehension or developmental mastery.

## Fun requirements

- Actions visibly change the scene: apples accumulate, the bag holds an object,
  and Teddy appears at the chosen correct location.
- Original, clearly recognizable game artwork; friendly faces and brief happy
  motion without flashing, constant movement, punishment, scores, or streaks.
- Optional short chimes and browser read-aloud, off by default. No microphone.
- Child-paced rounds, explicit replay, and no automatic advancement.
- Large draggable objects, tap placement and keyboard alternatives; reduced
  motion support and textual feedback independent of sound or color.
- A caregiver-led, screen-free idea available at any time and after completion.

"Fun" has not been validated with families. Before broader release, observe
caregiver-child play with appropriate consent: can the child initiate actions,
understand feedback, willingly repeat or vary play, and stop without pressure?
Do not use session length as the primary success metric. Keep the current
synthetic-only prototype separate from any future participant-data collection.

## Research context

These sources informed design direction; none validates this particular app:

- [Harvard executive-function activity guide](https://developingchild.harvard.edu/resources/handouts-tools/activities-guide-enhancing-and-practicing-executive-function-skills/): adult-supported play and age-appropriate practice.
- [Bing Nursery School philosophy](https://bingschool.stanford.edu/childrens-programs/philosophy): child-centered, play-based learning.
- [Montessori infant and toddler programs](https://amshq.org/about-us/inside-the-montessori-classroom/infant-and-toddler/): language and practical-life experiences.
- [AAP media guidance](https://www.aap.org/5Cs): consider the child, content, and real-world experiences displaced by media.

## Verification and limitations

Unit tests cover all nine rounds, rejection of distractors, duplicate drops,
and invalid round selection. Chromium tests exercise touch at phone, tablet,
and desktop sizes; cancellation, tap placement, keyboard, activity switching,
replay, offline prompts, reduced motion, and accessibility checks are included.
Speech quality varies by browser; automated tests verify opt-in controls, not
the quality of audible output. Safari and physical-device testing are pending.
Original SVG artwork is in `app/assets/play-world.svg`.
