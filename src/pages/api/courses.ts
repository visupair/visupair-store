import type { APIRoute } from 'astro';
import { sanityClient, urlFor } from '../../lib/sanity';

export const GET: APIRoute = async () => {
  try {
    console.log('[API] Fetching courses from Sanity...');

    const courses = await sanityClient.fetch(`
      *[_type == "course"] | order(name asc) {
        _id,
        name,
        "slug": slug.current,
        price,
        description,
        mainImage {
          asset->{
            _id,
            url
          },
          alt
        },
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

    console.log('[API] Fetched courses:', courses.length);

    // Process images with proper sizing
    const processedCourses = courses.map((course: any) => {
      console.log('[API] Processing course:', course.name);
      console.log('[API] mainImage:', course.mainImage);
      console.log('[API] instructor.avatar:', course.instructor?.avatar);

      return {
        ...course,
        mainImage: (course.mainImage?.asset)
          ? urlFor(course.mainImage).width(800).height(600).fit('crop').url()
          : null,
        instructor: course.instructor ? {
          ...course.instructor,
          avatar: (course.instructor.avatar?.asset)
            ? urlFor(course.instructor.avatar).width(160).height(160).fit('crop').url()
            : null
        } : null
      };
    });

    console.log('[API] Processed courses:', processedCourses.length);

    return new Response(JSON.stringify(processedCourses), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[API] Error fetching courses:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch courses', details: String(error) }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};
