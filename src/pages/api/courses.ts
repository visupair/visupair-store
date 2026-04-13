import type { APIRoute } from 'astro';
import { sanityClient, urlFor } from '../../lib/sanity';

export const GET: APIRoute = async () => {
  try {
    const courses = await sanityClient.fetch(`
      *[_type == "course"] | order(name asc) {
        _id,
        name,
        "slug": slug.current,
        pricingType,
        price,
        pricePLN,
        stripePriceId,
        donationPresets,
        description,
        mainImage {
          asset->{
            _id,
            url
          },
          alt
        },
        startsAt,
        registrationOpen,

        instructor {
          name,
          title,
          avatar {
            asset->{
              _id,
              url
            },
            alt
          }
        },
        details,
        curriculum
      }
    `);

    // Process images with proper sizing
    const processedCourses = courses.map((course: any) => {
      return {
        ...course,
        pricingType: course.pricingType || 'paid',
        donationPresets: course.donationPresets || [5, 25, 50],
        mainImage: (course.mainImage?.asset)
          ? urlFor(course.mainImage).width(800).height(600).fit('crop').url()
          : null,
        instructor: course.instructor ? {
          ...course.instructor,
          // Card footer avatar is ~24 CSS px; 96px covers ~3x without full-res fetch
          avatar: (course.instructor.avatar?.asset)
            ? urlFor(course.instructor.avatar).width(96).height(96).fit('crop').url()
            : null
        } : null
      };
    });

    return new Response(JSON.stringify(processedCourses), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[API] Error fetching courses:', error);
    const payload =
      import.meta.env.DEV
        ? { error: 'Failed to fetch courses', details: String(error) }
        : { error: 'Failed to fetch courses' };
    return new Response(JSON.stringify(payload), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};
