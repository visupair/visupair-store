import type { APIRoute } from 'astro';
import { sanityClient, urlFor } from '../../../lib/sanity';

export const GET: APIRoute = async ({ params }) => {
    const { slug } = params;

    if (!slug) {
        return new Response(
            JSON.stringify({ error: 'Slug parameter is required' }),
            {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
    }

    try {
        const course = await sanityClient.fetch(
            `
      *[_type == "course" && slug.current == $slug][0] {
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
    `,
            { slug }
        );

        if (!course) {
            return new Response(
                JSON.stringify({ error: 'Course not found' }),
                {
                    status: 404,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );
        }

        // Process images with proper sizing
        const processedCourse = {
            ...course,
            mainImage: (course.mainImage?.asset)
                ? urlFor(course.mainImage).width(1200).height(800).fit('crop').url()
                : null,
            instructor: course.instructor ? {
                ...course.instructor,
                avatar: (course.instructor.avatar?.asset)
                    ? urlFor(course.instructor.avatar).width(160).height(160).fit('crop').url()
                    : null
            } : null
        };

        return new Response(JSON.stringify(processedCourse), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    } catch (error) {
        console.error('Error fetching course:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to fetch course' }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
    }
};
