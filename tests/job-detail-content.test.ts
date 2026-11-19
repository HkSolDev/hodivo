import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  JobDetailContent,
  type JobDetailData,
} from '../components/jobs/job-detail-content.tsx';

const completeJob: JobDetailData = {
  id: 'review-technical-assistant',
  postName: 'Technical Assistant — Physics and Electronics',
  organization: 'Example Public Research Institute',
  applicationLastDate: '2026-11-30',
  educationRequired:
    'BSc in Physics with 60% marks OR Diploma in Electronics with 50% marks and 3 years of relevant experience.',
  vacancies: 120,
  payLevel: 'Level 4',
  postGroup: 'Group C',
  minAge: 18,
  maxAge: 30,
  ageAsOnDate: '2026-11-01',
  categoryRelaxationApplies: true,
  designReview: true,
  categoryRelaxationRules: { SC: 5, OBC: 3 },
  eligibilityRules: {
    gender_requirement: 'Applicants of all genders can apply.',
    category_requirement: ['General / UR', 'SC'],
    education_options: [
      {
        minimum_level: 'BACHELOR',
        minimum_marks_percent: 60,
        qualification: 'BSc in Physics',
        conditions: 'Degree from a recognized university.',
      },
      {
        minimum_level: 'DIPLOMA',
        minimum_marks_percent: 50,
        qualification: 'Diploma in Electronics',
        conditions: 'Three years of relevant experience required.',
      },
    ],
    age_rules: [
      {
        category: 'SC',
        min_age: 18,
        max_age: 35,
        relaxation_years: 5,
      },
    ],
  },
  source: {
    fetchedAt: '14 Oct 2026, 2:00 PM',
  },
};

const jobWithReviewedDetails: JobDetailData = {
  id: 'senior-assistant-du',
  postName: 'Senior Assistant (Administration)',
  organization: 'University of Delhi',
  applicationLastDate: '2026-12-15',
  vacancies: 25,
  minAge: 18,
  maxAge: 30,
  reviewedDetails: {
    post_name: 'Senior Assistant (Administration)',
    recruiting_body: 'University of Delhi',
    advertisement_number: 'Estab.IV/01/2026',
    vacancies: 25,
    employment_type: 'Direct Recruitment (Regular)',
    locations: ['New Delhi', 'Delhi NCR'],
    application_start_date: '2026-11-15',
    application_last_date: '2026-12-15',
    fee_payment_last_date: '2026-12-16',
    exam_dates: ['Tier 1 CBT: February 2027'],
    nationality_requirement: 'Citizen of India',
    pay: {
      minimum_amount: 35400,
      maximum_amount: 112400,
      currency: 'INR',
      period: 'per month',
      conditions: 'Pay Matrix Level 6 plus admissible allowances',
    },
    experience_rules: [
      {
        minimum_years: 2,
        conditions:
          'Experience in administration or accounts in university or PSU',
      },
    ],
    fee_rules: [
      {
        categories: ['UR', 'OBC', 'EWS'],
        amount: 500,
        currency: 'INR',
        conditions: 'Online payment gateway',
      },
      {
        categories: ['SC', 'ST', 'PwBD', 'Female'],
        amount: 0,
        currency: 'INR',
        conditions: 'Exempted from application fee',
      },
    ],
    selection_process: [
      'Written Examination (Objective & Descriptive)',
      'Skill Test on Computer',
      'Document Verification',
    ],
    application_steps: [
      'Access the online recruitment portal',
      'Fill required educational and personal details',
      'Upload photograph, signature, and category certificates',
      'Submit the form and retain the application receipt',
    ],
    documents_required: [
      'Class 10 Certificate for date of birth proof',
      'Degree marksheets and pass certificate',
      'Caste/Category certificate in official central format',
      'Relevant experience certificate from employer',
    ],
    language_requirements: ['Working knowledge of English and Hindi'],
    other_requirements: [
      'Typing speed of 35 wpm in English or 30 wpm in Hindi',
    ],
    apply_url: 'https://du.ac.in/apply-online',
    official_site_url: 'https://du.ac.in',
  },
  source: {
    url: 'https://du.ac.in/recruitment',
    notificationPdfUrl: 'https://du.ac.in/notices/advt-01-2026.pdf',
    applyUrl: 'https://du.ac.in/apply-online',
    fetchedAt: '24 Oct 2026, 10:00 AM',
  },
};

test('renders complete job details with linked requirements and application actions', () => {
  const markup = renderToStaticMarkup(
    createElement(JobDetailContent, { job: completeJob }),
  );

  assert.match(markup, /Technical Assistant — Physics and Electronics/);
  assert.match(markup, /Example Public Research Institute/);
  assert.match(markup, /Qualification routes/);
  assert.match(markup, /Diploma in Electronics/);
  assert.match(markup, /Age requirements and relaxations/);
  assert.match(markup, /Applicant requirements/);
  assert.match(markup, /Vacancies and pay/);
  assert.match(markup, /Application portal/);
  assert.match(markup, /Save job/);
  assert.match(markup, /Bachelor’s degree/);
  assert.match(markup, /Preview only/);
  assert.match(markup, /Collection date is not a verification date/);
  assert.doesNotMatch(markup, /example\.invalid/);
});

test('renders published reviewedDetails fields including pay, experience, fees, steps, and documents', () => {
  const markup = renderToStaticMarkup(
    createElement(JobDetailContent, { job: jobWithReviewedDetails }),
  );

  // Header & identity
  assert.match(markup, /Senior Assistant \(Administration\)/);
  assert.match(markup, /University of Delhi/);
  assert.match(markup, /Advt\. No\. Estab\.IV\/01\/2026/);
  assert.match(markup, /Application deadline: 15 Dec 2026/);

  // Pay and employment
  assert.match(markup, /₹35,400 – ₹1,12,400 \(per month\)/);
  assert.match(markup, /Pay Matrix Level 6 plus admissible allowances/);
  assert.match(markup, /Direct Recruitment \(Regular\)/);
  assert.match(markup, /New Delhi, Delhi NCR/);

  // Experience
  assert.match(markup, /Experience requirements/);
  assert.match(markup, /2 years/);
  assert.match(
    markup,
    /Experience in administration or accounts in university or PSU/,
  );

  // Application fees & zero fee preservation
  assert.match(markup, /Application fees/);
  assert.match(markup, /₹500/);
  assert.match(markup, /Free \/ Nil \(₹0\)/);
  assert.match(markup, /SC, ST, PwBD, Female/);
  assert.match(markup, /Fee payment deadline: 16 Dec 2026/);

  // Selection process & application steps
  assert.match(markup, /Selection process/);
  assert.match(markup, /Written Examination \(Objective &amp; Descriptive\)/);
  assert.match(markup, /Skill Test on Computer/);
  assert.match(markup, /How to apply/);
  assert.match(markup, /Access the online recruitment portal/);
  assert.match(markup, /Submit the form and retain the application receipt/);

  // Required documents
  assert.match(markup, /Required documents/);
  assert.match(markup, /Class 10 Certificate for date of birth proof/);
  assert.match(markup, /Relevant experience certificate from employer/);

  // Important dates and additional requirements
  assert.match(markup, /Important dates and additional details/);
  assert.match(markup, /Applications open/);
  assert.match(markup, /15 Nov 2026/);
  assert.match(markup, /Tier 1 CBT: February 2027/);
  assert.match(markup, /Working knowledge of English and Hindi/);
  assert.match(markup, /Typing speed of 35 wpm in English or 30 wpm in Hindi/);

  // Nationality
  assert.match(markup, /Citizen of India/);

  // Apply now action
  assert.match(markup, /Apply now/);
});

test('renders primary view notice action when apply URL is missing', () => {
  const jobWithoutApplyUrl: JobDetailData = {
    id: 'notice-only',
    postName: 'Junior Engineer (Civil)',
    organization: 'State Public Works Department',
    source: {
      url: 'https://spwd.gov.in/notices/je-2026',
      notificationPdfUrl: 'https://spwd.gov.in/docs/je-recruitment.pdf',
      applyUrl: null,
    },
  };

  const markup = renderToStaticMarkup(
    createElement(JobDetailContent, { job: jobWithoutApplyUrl }),
  );

  assert.match(markup, /View recruitment notice/);
  assert.doesNotMatch(markup, /Apply now/);
  assert.match(markup, /https:\/\/spwd\.gov\.in\/docs\/je-recruitment\.pdf/);
});

test('preserves legitimate zero values for fees, experience, and vacancies', () => {
  const zeroJob: JobDetailData = {
    id: 'zero-job',
    postName: 'Graduate Apprentice',
    organization: 'National Engineering Corporation',
    vacancies: 0,
    reviewedDetails: {
      vacancies: 0,
      fee_rules: [
        {
          categories: ['All candidates'],
          amount: 0,
          currency: 'INR',
          conditions: 'No fee for apprenticeship',
        },
      ],
      experience_rules: [
        {
          minimum_years: 0,
          conditions: 'Fresh graduates eligible',
        },
      ],
    },
    source: {
      url: 'https://nec.example.org/jobs',
    },
  };

  const markup = renderToStaticMarkup(
    createElement(JobDetailContent, { job: zeroJob }),
  );

  // Total vacancies: 0 preserved
  assert.match(markup, /Total vacancies/);
  assert.match(markup, /<dd>0<\/dd>/);

  // Free application fee preserved
  assert.match(markup, /Free \/ Nil \(₹0\)/);

  // Zero experience preserved
  assert.match(markup, /No minimum experience required \(0 years\)/);
  assert.match(markup, /Fresh graduates eligible/);
});

test('does not render unsafe recruitment links or empty-field placeholders', () => {
  const markup = renderToStaticMarkup(
    createElement(JobDetailContent, {
      job: {
        id: 'incomplete',
        postName: 'Incomplete notice',
        source: { notificationPdfUrl: 'javascript:alert(1)' },
      },
    }),
  );

  assert.match(
    markup,
    /Qualification details unavailable here\. Verify in the recruitment notice\./,
  );
  assert.match(
    markup,
    /Age requirements unavailable here\. Verify in the recruitment notice\./,
  );
  assert.doesNotMatch(
    markup,
    /Applicant requirement details unavailable here\. Verify in the recruitment notice\./,
  );
  assert.match(
    markup,
    /Deadline unavailable\. Check the recruitment notice before applying\./,
  );
  assert.match(
    markup,
    /Recruiting organization unavailable here\. Verify in the recruitment notice\./,
  );
  assert.doesNotMatch(markup, /javascript:/);
  assert.doesNotMatch(markup, /Not specified/);
  assert.doesNotMatch(markup, /null/);
  assert.doesNotMatch(markup, /Selection process/);
  assert.doesNotMatch(markup, /How to apply/);
  assert.doesNotMatch(markup, /Required documents/);
  assert.doesNotMatch(markup, /Experience requirements/);
  assert.doesNotMatch(markup, /Application fees/);
});

test('uses the stored vacancy count and preserves condition-only requirements without inventing currency or fee scope', () => {
  const markup = renderToStaticMarkup(
    createElement(JobDetailContent, {
      job: {
        id: 'sparse-reviewed',
        postName: 'Illustrative Assistant',
        minAge: 18,
        reviewedDetails: {
          vacancy_breakdown: [
            { category: 'SC', region_or_organisation: 'North', count: 0 },
          ],
          pay: { minimum_amount: 100, currency: null },
          experience_rules: [
            {
              minimum_years: null,
              conditions: 'Experience assessed according to notice paragraph 4',
            },
          ],
          fee_rules: [
            {
              categories: [],
              amount: null,
              conditions: 'Exemption depends on certificate verification',
            },
          ],
        },
      },
    }),
  );
  assert.match(markup, /North/);
  assert.match(markup, /<strong>0<\/strong>/);
  assert.match(markup, /Experience assessed according to notice paragraph 4/);
  assert.match(markup, /Exemption depends on certificate verification/);
  assert.doesNotMatch(markup, /All applicants|₹100|years or above/);
  assert.match(markup, /Maximum age unavailable here/);
});

test('shows the base age independently of category limits and preserves unknown bounds', () => {
  for (const [minAge, maxAge, expected] of [
    [18, 30, '18–30 years'],
    [null, 35, 'Up to 35 years'],
    [18, null, 'At least 18 years'],
    [null, null, null],
  ] as const) {
    const job: JobDetailData = {
      ...completeJob,
      minAge,
      maxAge,
      reviewedDetails: null,
    };
    const before = JSON.stringify(job);
    const markup = renderToStaticMarkup(
      createElement(JobDetailContent, { job }),
    );
    if (expected) {
      assert.ok(markup.includes(`Base age: <strong>${expected}</strong>`));
    } else {
      assert.doesNotMatch(markup, /Base age:/);
    }
    assert.doesNotMatch(markup, /Base age: <strong>18–35 years/);
    assert.match(markup, /18–35 years/); // The separate SC rule is retained.
    assert.match(markup, /Age calculated as on/);
    assert.equal(JSON.stringify(job), before);
  }
});

test('public projection renders official notice links without discovery-portal redirects', async () => {
  const { publicJobPresentation } =
    await import('../src/lib/public-job-presentation.js');
  const job = publicJobPresentation({
    id: 'official-only-links',
    postName: 'JKSSB IES Junior Engineer | Sarkari Result',
    source: {
      url: 'https://sarkariresult.com/discovery/je',
      notificationPdfUrl: 'https://jkssb.nic.in/notices/je.pdf',
      officialSiteUrl: 'https://jkssb.nic.in/',
      applyUrl: 'https://freejobalert.com/apply',
    },
    reviewedDetails: { apply_url: 'https://mysarkarinaukri.com/apply' },
  });
  const markup = renderToStaticMarkup(createElement(JobDetailContent, { job }));
  assert.match(markup, /JKSSB IES Junior Engineer/);
  assert.match(markup, /href="https:\/\/jkssb\.nic\.in\/notices\/je\.pdf"/);
  assert.doesNotMatch(
    markup,
    /sarkariresult\.com|freejobalert\.com|mysarkarinaukri\.com/i,
  );
  assert.doesNotMatch(markup, /Apply now/);
});

test('renders click-to-play YouTube facade without iframe on initial SSR for single video', () => {
  const markup = renderToStaticMarkup(
    createElement(JobDetailContent, {
      job: {
        ...completeJob,
        reviewedDetails: {
          youtube_resources: [
            {
              title: 'SSC CGL Strategy Breakdown',
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              channel: 'StudyIQ',
              topics: ['Strategy'],
            },
          ],
        },
      },
    }),
  );
  assert.match(markup, /Free preparation videos \(YouTube\)/);
  assert.match(markup, /SSC CGL Strategy Breakdown/);
  assert.match(markup, /StudyIQ/);
  assert.match(
    markup,
    /https:\/\/i\.ytimg\.com\/vi\/dQw4w9WgXcQ\/hqdefault\.jpg/,
  );
  assert.match(markup, /aria-label="Play SSC CGL Strategy Breakdown"/);
  assert.match(markup, /Open on YouTube/);
  assert.doesNotMatch(markup, /<iframe/i);
  assert.doesNotMatch(markup, /Up next ·/);
  assert.doesNotMatch(markup, /Filter videos by topic/);
});

test('renders playlist selector and topic filters when multiple YouTube resources have 2+ topics', () => {
  const markup = renderToStaticMarkup(
    createElement(JobDetailContent, {
      job: {
        ...completeJob,
        reviewedDetails: {
          youtube_resources: [
            {
              title: 'Full Quant Revision',
              url: 'https://youtu.be/dQw4w9WgXcQ',
              channel: 'Maths Hub',
              topics: ['Maths'],
            },
            {
              title: 'Complete GS Playlist',
              url: 'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf',
              channel: 'GS Academy',
              topics: ['General Studies'],
            },
          ],
        },
      },
    }),
  );
  assert.match(markup, /All topics/);
  assert.match(markup, /Maths/);
  assert.match(markup, /General Studies/);
  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /aria-pressed="false"/);
  assert.match(markup, /Playlist/);
  assert.doesNotMatch(markup, /<iframe/i);
});

test('ignores invalid or non-YouTube URLs in youtube_resources', () => {
  const markup = renderToStaticMarkup(
    createElement(JobDetailContent, {
      job: {
        ...completeJob,
        reviewedDetails: {
          youtube_resources: [
            {
              title: 'Not YouTube',
              url: 'https://example.com/watch?v=dQw4w9WgXcQ',
            },
            {
              title: 'Insecure HTTP',
              url: 'http://youtube.com/watch?v=dQw4w9WgXcQ',
            },
            {
              title: 'XSS attempt',
              url: 'javascript:alert(1)',
            },
          ],
        },
      },
    }),
  );
  assert.doesNotMatch(markup, /Free preparation videos \(YouTube\)/);
  assert.doesNotMatch(markup, /Not YouTube|Insecure HTTP|XSS attempt/);
});

test('caps long YouTube playlists to 4 visible cards with an expand toggle', () => {
  const videos = [1, 2, 3, 4, 5, 6].map((n) => ({
    title: `Preparation Session ${n}`,
    url: `https://www.youtube.com/watch?v=dQw4w9WgXc${n}`,
    channel: `Channel ${n}`,
    topics: ['Strategy'],
  }));
  const markup = renderToStaticMarkup(
    createElement(JobDetailContent, {
      job: {
        ...completeJob,
        reviewedDetails: { youtube_resources: videos },
      },
    }),
  );
  assert.match(markup, /Preparation Session 1/);
  assert.match(markup, /Preparation Session 4/);
  assert.doesNotMatch(markup, /Preparation Session 5/);
  assert.doesNotMatch(markup, /Preparation Session 6/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /Show all 6 videos \(2 more\)/);
});

test('uses playlist count labels when all youtube_resources are playlists', () => {
  const markup = renderToStaticMarkup(
    createElement(JobDetailContent, {
      job: {
        ...completeJob,
        reviewedDetails: {
          youtube_resources: [
            {
              title: 'GK / GS Practice Playlist',
              url: 'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf',
              channel: 'Adda247',
              topics: ['General Awareness'],
            },
            {
              title: 'English Language PYQs',
              url: 'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdg',
              channel: 'Adda247',
              topics: ['English'],
            },
          ],
        },
      },
    }),
  );
  assert.match(markup, /2 playlists/);
  assert.match(markup, /Up next · 2 playlists/);
  assert.doesNotMatch(markup, /2 videos/);
});

test('renders JobDetailSection disclosure toggle with responsive button markup', () => {
  const markup = renderToStaticMarkup(
    createElement(JobDetailContent, { job: completeJob }),
  );
  assert.match(markup, /Qualification routes/);
  assert.match(markup, /Hide<span class="toggleSuffix"> details<\/span>/);
  assert.match(markup, /class="toggleButton"/);
});

test('renders dynamic On this page jump links only for present sections', () => {
  const minimalMarkup = renderToStaticMarkup(
    createElement(JobDetailContent, {
      job: {
        id: 'minimal-job',
        postName: 'Junior Clerk',
      },
    }),
  );
  assert.match(minimalMarkup, /aria-label="Jump to job section"/);
  assert.match(minimalMarkup, /href="#qualification"/);
  assert.match(minimalMarkup, /id="qualification"/);
  assert.match(minimalMarkup, /href="#age"/);
  assert.match(minimalMarkup, /id="age"/);
  assert.match(minimalMarkup, /href="#links"/);
  assert.match(minimalMarkup, /id="links"/);
  assert.doesNotMatch(minimalMarkup, /href="#videos"/);
  assert.doesNotMatch(minimalMarkup, /href="#syllabus"/);

  const richMarkup = renderToStaticMarkup(
    createElement(JobDetailContent, {
      job: {
        ...completeJob,
        reviewedDetails: {
          official_syllabus: [{ subject: 'Maths', topics: ['Algebra'] }],
          youtube_resources: [
            {
              title: 'Maths Revision',
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            },
          ],
          application_steps: ['Fill the online form'],
        },
      },
    }),
  );
  assert.match(richMarkup, /href="#syllabus"/);
  assert.match(richMarkup, /id="syllabus"/);
  assert.match(richMarkup, /href="#videos"/);
  assert.match(richMarkup, /id="videos"/);
  assert.match(richMarkup, /href="#how-to-apply"/);
  assert.match(richMarkup, /id="how-to-apply"/);
});
